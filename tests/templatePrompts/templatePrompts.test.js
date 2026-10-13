const { buildTemplatePrompt, parseTemplateResponse, parseTemplateReviewReport, prepareTemplateApply, applyTemplateDraft, VARIANTS } = require('../../backend/templatePrompts');

const template = {
  template_id: 'builtin.t07', template_version: 1, display_name: 'Đề kết hợp',
  defaults: { subject: 'Toán', grade: '6', topic: 'Số nguyên', duration_minutes: 45 },
  sections: [
    { section_id: 'builtin.t07.s01', title: 'Trắc nghiệm', slots: [
      { slot_id: 'builtin.t07.s01.q001', question_type: 'MCQ', difficulty_level: 'NB', points: '1.00', required: true, answer_space: { kind: 'none', lines: 0 }, content: null }
    ] },
    { section_id: 'builtin.t07.s02', title: 'Tự luận', slots: [
      { slot_id: 'builtin.t07.s02.q001', question_type: 'ESSAY', difficulty_level: 'VD', points: '2.00', required: true, answer_space: { kind: 'lined', lines: 8 }, content: null }
    ] }
  ]
};
const mcq = `[CAU_HOI]\nMa_Khung: builtin.t07.s01.q001\nMa_Phan: builtin.t07.s01\nDiem: 1.00\nLoai: TN\nMuc_Do: Nhan_Biet\nDe_Bai: Tính 2 + 3.\nA. 4\nB. 5\nC. 6\nD. 7\nDap_An: B\nLoi_Giai: 2 cộng 3 bằng 5.\nSo_Dong_Nhap: 0`;
const essay = `[CAU_HOI]\nMa_Khung: builtin.t07.s02.q001\nMa_Phan: builtin.t07.s02\nDiem: 2.00\nLoai: TU_LUAN\nMuc_Do: Van_Dung\nDe_Bai: Giải x + 1 = 3.\nDap_An: x = 2.\nLoi_Giai: Trừ 1 hai vế, được x = 2.\nSo_Dong_Nhap: 8`;
const full = `=PHAN_1=\n${mcq}\n=PHAN_2=\n${essay}`;

test('all 3 groups and 5 variants keep exact dynamic obligations', () => {
  for (const aiVariant of Object.keys(VARIANTS)) {
    for (const promptGroup of ['FULL_EXAM', 'SELECTED_SLOTS', 'REVIEW_REPAIR']) {
      const input = { template, aiVariant, promptGroup, selectedSlotIds: ['builtin.t07.s02.q001'] };
      const a = buildTemplatePrompt(input);
      expect(a).toEqual(buildTemplatePrompt(input));
      expect(a.prompt).toContain('Ma_Khung: builtin.t07.s02.q001');
      expect(a.prompt).toContain('Diem: 2.00');
      expect(a.prompt).toContain('So_Dong_Nhap: 8');
      expect(a.targetSlotIds).toHaveLength(promptGroup === 'FULL_EXAM' ? 2 : 1);
      if (promptGroup !== 'FULL_EXAM') expect(a.prompt).not.toContain('Ma_Khung: builtin.t07.s01.q001');
    }
  }
  const changed = structuredClone(template);
  changed.sections[1].slots[0].points = '2.50';
  expect(buildTemplatePrompt({ template: changed }).sha256).not.toBe(buildTemplatePrompt({ template }).sha256);
});

test('metadata stripped before legacy parser and exact IDs mapped', async () => {
  const entries = await parseTemplateResponse(full);
  expect(entries).toHaveLength(2);
  expect(entries[1].question.correct_answer).toBe('x = 2.');
  const draft = await prepareTemplateApply({ template, rawText: full });
  expect(draft.valid).toBe(true);
  expect(draft.assignments.map(x => x.slot_id)).toEqual(['builtin.t07.s01.q001', 'builtin.t07.s02.q001']);
  expect(() => applyTemplateDraft({ draft })).toThrow('xác nhận');
  const existing = { untouched: { content: 'keep' } };
  const applied = applyTemplateDraft({ currentContent: existing, draft, confirmed: true });
  expect(applied.content.untouched).toEqual(existing.untouched);
  expect(existing['builtin.t07.s01.q001']).toBeUndefined();
  expect(applied.undo['builtin.t07.s01.q001']).toBeNull();
});

test('partial mapping preserves untouched and rejects score override', async () => {
  const selectedSlotIds = ['builtin.t07.s02.q001'];
  const currentContent = { 'builtin.t07.s01.q001': { content: 'old' } };
  const draft = await prepareTemplateApply({ template, rawText: `=PHAN_2=\n${essay}`, promptGroup: 'SELECTED_SLOTS', selectedSlotIds, currentContent });
  expect(draft.valid).toBe(true);
  expect(applyTemplateDraft({ draft, currentContent, confirmed: true }).content['builtin.t07.s01.q001']).toEqual({ content: 'old' });
  const bad = await prepareTemplateApply({ template, rawText: `=PHAN_2=\n${essay.replace('Diem: 2.00', 'Diem: 3.00')}`, promptGroup: 'SELECTED_SLOTS', selectedSlotIds });
  expect(bad.valid).toBe(false);
  expect(bad.issues.some(x => x.code === 'POINTS_MISMATCH')).toBe(true);
});

test('missing IDs only suggest a unique slot; duplicate and extra IDs fail', async () => {
  const noId = await prepareTemplateApply({ template, rawText: `=PHAN_2=\n${essay.replace('Ma_Khung: builtin.t07.s02.q001\n', '')}`, promptGroup: 'SELECTED_SLOTS', selectedSlotIds: ['builtin.t07.s02.q001'] });
  expect(noId.valid).toBe(true);
  expect(noId.issues.some(x => x.code === 'INFERRED_SLOT')).toBe(true);
  const duplicate = await prepareTemplateApply({ template, rawText: `=PHAN_1=\n${mcq}\n${mcq}` });
  expect(duplicate.valid).toBe(false);
  expect(duplicate.issues.some(x => x.code === 'DUPLICATE_SLOT')).toBe(true);
  const extra = await prepareTemplateApply({ template, rawText: `=PHAN_1=\n${mcq.replace('builtin.t07.s01.q001', 'unknown')}` });
  expect(extra.issues.some(x => x.code === 'UNEXPECTED_SLOT')).toBe(true);
});

test('size/control input rejected', async () => {
  await expect(parseTemplateResponse('\u0000[CAU_HOI]')).rejects.toThrow('điều khiển');
  await expect(parseTemplateResponse('a'.repeat(512 * 1024 + 1))).rejects.toThrow('512 KiB');
});

test('duplicate fields and unsafe markup are blocked before apply', async () => {
  const duplicate = await prepareTemplateApply({ template, rawText: `=PHAN_1=\n${mcq.replace('Dap_An: B', 'Dap_An: A\nDap_An: B')}`, promptGroup: 'SELECTED_SLOTS', selectedSlotIds: ['builtin.t07.s01.q001'] });
  expect(duplicate.valid).toBe(false);
  expect(duplicate.issues.some(x => x.code === 'DUPLICATE_FIELD')).toBe(true);
  const unsafe = await prepareTemplateApply({ template, rawText: `=PHAN_1=\n${mcq.replace('Tính 2 + 3.', '<script>alert(1)</script>')}`, promptGroup: 'SELECTED_SLOTS', selectedSlotIds: ['builtin.t07.s01.q001'] });
  expect(unsafe.issues.some(x => x.code === 'UNSAFE_MARKUP')).toBe(true);
});

test('validate-only P3 produces a report that cannot apply', () => {
  const selectedSlotIds = ['builtin.t07.s02.q001'];
  const built = buildTemplatePrompt({ template, promptGroup: 'REVIEW_REPAIR', selectedSlotIds, repairIntent: 'validate-only' });
  expect(built.outputKind).toBe('review-report-v1');
  const report = parseTemplateReviewReport(JSON.stringify({ rulesetVersion: built.rulesetVersion, issues: [{ slot_id: selectedSlotIds[0], severity: 'warning', message: 'Cần kiểm tra lời giải.' }] }), selectedSlotIds);
  expect(report.canApply).toBe(false);
  expect(() => parseTemplateReviewReport(JSON.stringify({ rulesetVersion: built.rulesetVersion, issues: [{ slot_id: 'other', severity: 'warning', message: 'x' }] }), selectedSlotIds)).toThrow('ngoài phạm vi');
});

test('unique legacy question without metadata can be reviewed while template owns points', async () => {
  const rawText = `=PHAN_1=\n${mcq.replace(/Ma_Khung:.*\nMa_Phan:.*\nDiem:.*\n/, '').replace('So_Dong_Nhap: 0', '')}`;
  const draft = await prepareTemplateApply({ template, rawText, promptGroup: 'SELECTED_SLOTS', selectedSlotIds: ['builtin.t07.s01.q001'] });
  expect(draft.valid).toBe(true);
  expect(draft.issues.map(x => x.code)).toEqual(expect.arrayContaining(['INFERRED_SLOT', 'LEGACY_POINTS', 'LEGACY_LINES']));
});

describe('P3 repair intents', () => {
  const essayId = 'builtin.t07.s02.q001';
  const harder = essay.replace('Muc_Do: Van_Dung', 'Muc_Do: Van_Dung_Cao');

  test('TC-P3-01: tang do kho yeu cau Muc_Do moi cao hon mot muc trong prompt', () => {
    const { prompt } = buildTemplatePrompt({ template, promptGroup: 'REVIEW_REPAIR', aiVariant: 'Claude', selectedSlotIds: [essayId], repairIntent: 'increase-difficulty' });
    expect(prompt).toContain('Muc_Do: Van_Dung_Cao');
    expect(prompt).toContain('increase-difficulty');
  });

  test('TC-P3-02: tang do kho chap nhan muc moi, nhung sua thuong van bat lech muc do', async () => {
    const ok = await prepareTemplateApply({ template, rawText: `=PHAN_2=\n${harder}`, promptGroup: 'REVIEW_REPAIR', selectedSlotIds: [essayId], repairIntent: 'increase-difficulty' });
    expect(ok.valid).toBe(true);
    const strict = await prepareTemplateApply({ template, rawText: `=PHAN_2=\n${harder}`, promptGroup: 'REVIEW_REPAIR', selectedSlotIds: [essayId], repairIntent: 'rewrite-one' });
    expect(strict.issues.map(x => x.code)).toContain('DIFFICULTY_MISMATCH');
  });

  test('TC-P3-03: cai thien loi giai khong duoc doi dap an', async () => {
    const currentContent = { [essayId]: { content: 'Giải x + 1 = 3.', correct_answer: 'x = 5.', explanation: 'cu' } };
    const draft = await prepareTemplateApply({ template, rawText: `=PHAN_2=\n${essay}`, promptGroup: 'REVIEW_REPAIR', selectedSlotIds: [essayId], repairIntent: 'improve-solution', currentContent });
    expect(draft.valid).toBe(false);
    expect(draft.issues.map(x => x.code)).toContain('ANSWER_CHANGED');
    const same = await prepareTemplateApply({ template, rawText: `=PHAN_2=\n${essay}`, promptGroup: 'REVIEW_REPAIR', selectedSlotIds: [essayId], repairIntent: 'improve-solution', currentContent: { [essayId]: { correct_answer: 'x = 2.' } } });
    expect(same.valid).toBe(true);
  });

  test('TC-P3-04: hanh dong la bi tu choi', () => {
    expect(() => buildTemplatePrompt({ template, promptGroup: 'REVIEW_REPAIR', selectedSlotIds: [essayId], repairIntent: 'ignore rules' })).toThrow('Hành động');
  });
});

test('TC-P1-COLLAPSED: van ban AI mat het xuong dong van tach dung tung cau va metadata', async () => {
  const collapsed = full.replace(/\n/g, '');
  const parsed = await parseTemplateResponse(collapsed);
  expect(parsed).toHaveLength(2);
  expect(parsed[0]).toMatchObject({ sectionNumber: 1, metadata: { ma_khung: 'builtin.t07.s01.q001', ma_phan: 'builtin.t07.s01', diem: '1.00' } });
  expect(parsed[0].question).toMatchObject({ question_type: 'MCQ', correct_answer: 'B' });
  expect(parsed[0].question.options.map(o => o.option_text)).toEqual(['4', '5', '6', '7']);
  expect(parsed[1]).toMatchObject({ sectionNumber: 2, metadata: { ma_khung: 'builtin.t07.s02.q001', diem: '2.00' } });
  expect(parsed[1].question).toMatchObject({ question_type: 'ESSAY', draft_lines_count: 8 });
  const draft = await prepareTemplateApply({ template, rawText: collapsed });
  expect(draft.valid).toBe(true);
});

test('TC-P1-LEVEL: P1 muc do AI khac slot (theo yeu cau giao vien) chi canh bao, van ap dung duoc', async () => {
  const draft = await prepareTemplateApply({ template, rawText: full.replace('Muc_Do: Nhan_Biet', 'Muc_Do: Thong_Hieu') });
  expect(draft.valid).toBe(true);
  const warn = draft.issues.find(x => x.code === 'DIFFICULTY_MISMATCH');
  expect(warn).toMatchObject({ severity: 'warning', expected: 'NB', actual: 'TH' });
  expect(draft.assignments[0].after.difficulty_level).toBe('TH');
});
