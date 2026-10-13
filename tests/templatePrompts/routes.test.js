const express = require('express');
const request = require('supertest');
const router = require('../../backend/routes/templatePromptRoutes');

const app = express();
app.use(express.json());
app.use('/api/template-prompts', router);

const template = { template_id: 'custom.one', template_version: 1, display_name: 'Một câu', sections: [{ section_id: 's1', title: 'Một', slots: [{ slot_id: 'q1', question_type: 'MCQ', difficulty_level: 'NB', points: '1.00', answer_space: { kind: 'none', lines: 0 } }] }] };
const answer = '=PHAN_1=\n[CAU_HOI]\nMa_Khung: q1\nMa_Phan: s1\nDiem: 1.00\nLoai: TN\nMuc_Do: Nhan_Biet\nDe_Bai: 2 + 2 = ?\nA. 1\nB. 2\nC. 3\nD. 4\nDap_An: D\nLoi_Giai: 2 cộng 2 bằng 4.\nSo_Dong_Nhap: 0';

test('build and prepare routes return bounded drafts', async () => {
  const built = await request(app).post('/api/template-prompts/build').send({ template, aiVariant: 'Grok' }).expect(200);
  expect(built.body.success).toBe(true);
  expect(built.body.targetSlotIds).toEqual(['q1']);
  const prepared = await request(app).post('/api/template-prompts/prepare').send({ template, rawText: answer }).expect(200);
  expect(prepared.body.draft.valid).toBe(true);
  expect(prepared.body.draft.assignments[0].slot_id).toBe('q1');
  const bad = await request(app).post('/api/template-prompts/build').send({ template, aiVariant: 'unsupported' }).expect(400);
  expect(bad.body.success).toBe(false);
});
