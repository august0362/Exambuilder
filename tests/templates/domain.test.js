process.env.EXAM_DB_PATH = ':memory:';
const { closeDb, getDb } = require('../../backend/database');
const { listSeeds, getSeed } = require('../../backend/templates/seeds');
const { validateTemplate, toCents } = require('../../backend/templates/validation');
const repo = require('../../backend/templates/repository');

afterEach(async () => { await closeDb(); });

test('ten immutable seeds are ordered T01–T10 and all point totals match', () => {
  const seeds = listSeeds();
  expect(seeds).toHaveLength(10);
  expect(seeds.map(t => t.template_id)).toEqual(Array.from({ length: 10 }, (_, i) => `builtin.t${String(i + 1).padStart(2, '0')}`));
  expect(seeds[8].display_name).toBe('Đề hai cột, tiết kiệm giấy');
  expect(seeds[9].display_name).toBe('Đề Ngoại ngữ có phần đọc hiểu');
  for (const seed of seeds) {
    expect(validateTemplate(seed)).toEqual([]);
    expect(seed.sections.reduce((n, s) => n + s.slots.length, 0)).toBeGreaterThan(0);
    expect(seed.sections.flatMap(s => s.slots).reduce((n, q) => n + toCents(q.points), 0)).toBe(1000);
  }
  const mutated = getSeed('builtin.t01');
  mutated.sections[0].slots.pop();
  expect(getSeed('builtin.t01').sections[0].slots).toHaveLength(4);
});

test('score validation uses cents and rejects mismatches and duplicate IDs', () => {
  const seed = getSeed('builtin.t01');
  seed.sections[0].slots[0].points = '0.51';
  expect(validateTemplate(seed).map(e => e.path)).toContain('sections.0.declared_points');
  seed.sections[0].slots[0].slot_id = seed.sections[0].slots[1].slot_id;
  expect(validateTemplate(seed).map(e => e.path)).toContain('sections.0.slots.1.slot_id');
  expect(toCents('1.01')).toBe(101);
  expect(toCents('1.001')).toBeNull();
});

test('clone creates independent IDs; immutable built-ins reject update and delete', async () => {
  const clone = await repo.cloneAndCreate('builtin.t10');
  expect(clone.template_id).toMatch(/^user\./);
  expect(clone.sections[0].slots[0].slot_id).toMatch(/^user\./);
  expect(clone.sections[0].stimulus).toBe('');
  expect(validateTemplate(clone)).toEqual([]);
  await expect(repo.updateTemplate('builtin.t10', clone, 1)).rejects.toMatchObject({ status: 403 });
  await expect(repo.deleteTemplate('builtin.t10')).rejects.toMatchObject({ status: 403 });
  expect((await repo.listTemplates()).length).toBe(11);
});

test('revisions persist, optimistic locking prevents overwrite, and soft delete keeps history', async () => {
  const clone = await repo.cloneAndCreate('builtin.t01');
  clone.display_name = 'Mẫu kiểm tra của tôi';
  const saved = await repo.updateTemplate(clone.template_id, clone, 1);
  expect(saved.template_version).toBe(2);
  expect((await repo.getTemplate(clone.template_id, 1)).template_version).toBe(1);
  await expect(repo.updateTemplate(clone.template_id, clone, 1)).rejects.toMatchObject({ status: 409 });
  expect((await repo.getTemplate(clone.template_id)).display_name).toBe('Mẫu kiểm tra của tôi');
  await repo.deleteTemplate(clone.template_id);
  expect(await repo.getTemplate(clone.template_id)).toBeNull();
  const db = await getDb();
  expect((await db.all('SELECT * FROM TEMPLATE_VERSION WHERE template_id = ?', [clone.template_id]))).toHaveLength(2);
});

test('large template with 100 slots validates quickly and enforces bounds', () => {
  const seed = getSeed('builtin.t05'); // 20 MCQ questions
  // Build a 100-slot template
  const large = structuredClone(seed);
  large.template_id = 'user.large-100';
  large.origin = 'user';
  large.sections[0].slots = Array.from({ length: 100 }, (_, i) => ({
    slot_id: `user.large.s01.q${String(i + 1).padStart(3, '0')}`,
    position: i,
    question_type: 'MCQ',
    difficulty_level: 'NB',
    points: '0.10',
    required: true,
    answer_space: { kind: 'none', lines: 0, min_lines: 0, max_lines: 0, auto_expand: false },
    content: null,
    assets: []
  }));
  large.sections[0].declared_points = '10.00';
  large.defaults.total_points = '10.00';

  const start = Date.now();
  const errors = validateTemplate(large);
  const elapsed = Date.now() - start;

  expect(errors).toEqual([]);
  expect(elapsed).toBeLessThan(100); // Phải validate cực nhanh dưới 100ms
});
