process.env.EXAM_DB_PATH = ':memory:';
const express = require('express');
const request = require('supertest');
const router = require('../../backend/routes/templateRoutes');
const { closeDb } = require('../../backend/database');

const app = express();
app.use(express.json());
app.use('/api/templates', router);
afterEach(async () => closeDb());

test('catalog, search, clone, update and delete through API', async () => {
  const catalog = await request(app).get('/api/templates');
  expect(catalog.status).toBe(200);
  expect(catalog.body.templates).toHaveLength(10);
  const search = await request(app).get('/api/templates?search=Ngoại%20ngữ');
  expect(search.body.templates.map(t => t.template_id)).toEqual(['builtin.t10']);
  const cloned = await request(app).post('/api/templates/builtin.t10/clone').send({ display_name: 'Ngoại ngữ của tôi' });
  expect(cloned.status).toBe(201);
  const template = cloned.body.template;
  expect(template.sections[0].slots).toHaveLength(4);
  const edited = structuredClone(template);
  edited.display_name = 'Ngoại ngữ sửa';
  const saved = await request(app).put(`/api/templates/${template.template_id}`).send({ expected_version: 1, template: edited });
  expect(saved.status).toBe(200);
  expect(saved.body.template.template_version).toBe(2);
  expect((await request(app).put(`/api/templates/${template.template_id}`).send({ expected_version: 1, template: edited })).status).toBe(409);
  expect((await request(app).delete(`/api/templates/${template.template_id}`)).status).toBe(200);
  expect((await request(app).get(`/api/templates/${template.template_id}`)).status).toBe(404);
});

test('built-ins are read-only and invalid score rejected', async () => {
  const source = (await request(app).get('/api/templates/builtin.t01')).body.template;
  expect((await request(app).delete('/api/templates/builtin.t01')).status).toBe(403);
  expect((await request(app).put('/api/templates/builtin.t01').send({ expected_version: 1, template: source })).status).toBe(403);
  source.sections[0].slots[0].points = '9.99';
  const response = await request(app).post('/api/templates/validate').send({ template: source });
  expect(response.status).toBe(400);
  expect(response.body.details.some(e => e.path === 'defaults.total_points')).toBe(true);
});
