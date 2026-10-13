const express = require('express');
const repository = require('../templates/repository');
const { validateTemplate } = require('../templates/validation');
const router = express.Router();

function sendError(res, error) {
  if (error instanceof repository.TemplateError) return res.status(error.status).json({ success: false, error: error.message, details: error.details });
  console.error(error);
  return res.status(500).json({ success: false, error: 'Lỗi xử lý mẫu' });
}

router.get('/', async (req, res) => {
  try { res.json({ success: true, templates: await repository.listTemplates({ origin: req.query.origin, search: req.query.search }) }); }
  catch (error) { sendError(res, error); }
});

router.post('/validate', (req, res) => {
  const details = validateTemplate(req.body.template || req.body);
  res.status(details.length ? 400 : 200).json({ success: !details.length, valid: !details.length, details, ...(details.length ? { error: 'Dữ liệu mẫu không hợp lệ' } : {}) });
});

router.get('/:id', async (req, res) => {
  try {
    const template = await repository.getTemplate(req.params.id, req.query.version);
    if (!template) return res.status(404).json({ success: false, error: 'Không tìm thấy mẫu' });
    res.json({ success: true, template });
  } catch (error) { sendError(res, error); }
});

router.post('/', async (req, res) => {
  try {
    const template = req.body.clone_from
      ? await repository.cloneAndCreate(req.body.clone_from, req.body.display_name)
      : await repository.createTemplate(req.body.template || req.body);
    res.status(201).json({ success: true, template });
  } catch (error) { sendError(res, error); }
});

router.post('/:id/clone', async (req, res) => {
  try { res.status(201).json({ success: true, template: await repository.cloneAndCreate(req.params.id, req.body.display_name) }); }
  catch (error) { sendError(res, error); }
});

router.put('/:id', async (req, res) => {
  try {
    const template = await repository.updateTemplate(req.params.id, req.body.template || req.body, Number(req.body.expected_version));
    res.json({ success: true, template });
  } catch (error) { sendError(res, error); }
});

router.delete('/:id', async (req, res) => {
  try { await repository.deleteTemplate(req.params.id); res.json({ success: true }); }
  catch (error) { sendError(res, error); }
});

module.exports = router;
