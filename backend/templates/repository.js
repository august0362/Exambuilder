const crypto = require('crypto');
const { getDb } = require('../database');
const { withLock } = require('../mutex');
const { getSeed, listSeeds } = require('./seeds');
const { validateTemplate } = require('./validation');

class TemplateError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}

function cloneTemplate(source, name) {
  const template = structuredClone(source);
  const id = `user.${crypto.randomUUID()}`;
  template.template_id = id;
  template.template_version = 1;
  template.origin = 'user';
  template.is_builtin = false;
  template.display_name = name || `${source.display_name} (bản sao)`;
  template.cloned_from = { template_id: source.template_id, template_version: source.template_version };
  template.sections.forEach((section, si) => {
    section.section_id = `${id}.s${String(si + 1).padStart(2, '0')}`;
    section.slots.forEach((slot, qi) => {
      slot.slot_id = `${section.section_id}.q${String(qi + 1).padStart(3, '0')}`;
      slot.position = qi;
    });
  });
  return template;
}

function assertValid(template) {
  const details = validateTemplate(template);
  if (details.length) throw new TemplateError(400, 'Dữ liệu mẫu không hợp lệ', details);
}

async function listTemplates(options = {}) {
  const db = await getDb();
  const rows = await db.all(`SELECT v.payload_json FROM TEMPLATE t JOIN TEMPLATE_VERSION v
    ON v.template_id = t.template_id AND v.template_version = t.current_version
    WHERE t.deleted_at IS NULL ORDER BY t.updated_at DESC`);
  let templates = [...listSeeds(), ...rows.map(row => JSON.parse(row.payload_json))];
  if (options.origin) templates = templates.filter(t => t.origin === options.origin);
  if (options.search) {
    const search = String(options.search).toLocaleLowerCase('vi');
    templates = templates.filter(t => `${t.display_name} ${t.description || ''} ${t.category || ''}`.toLocaleLowerCase('vi').includes(search));
  }
  return templates;
}

async function getTemplate(id, version) {
  const seed = getSeed(id);
  if (seed) return version && Number(version) !== 1 ? null : seed;
  const db = await getDb();
  const row = await db.get(`SELECT v.payload_json FROM TEMPLATE t JOIN TEMPLATE_VERSION v
    ON v.template_id = t.template_id AND v.template_version = ?
    WHERE t.template_id = ? AND t.deleted_at IS NULL`, [version || (await db.get('SELECT current_version FROM TEMPLATE WHERE template_id = ? AND deleted_at IS NULL', [id]))?.current_version, id]);
  return row ? JSON.parse(row.payload_json) : null;
}

async function createTemplate(template) {
  assertValid(template);
  if (template.origin !== 'user' || template.is_builtin || !template.template_id.startsWith('user.') || getSeed(template.template_id) || template.template_version !== 1) throw new TemplateError(400, 'Chỉ có thể tạo mẫu tùy chỉnh phiên bản 1');
  return withLock(async () => {
    const db = await getDb();
    try {
      await db.exec('BEGIN IMMEDIATE');
      const existing = await db.get('SELECT template_id FROM TEMPLATE WHERE template_id = ?', [template.template_id]);
      if (existing) throw new TemplateError(409, 'Mã mẫu đã tồn tại');
      await db.run('INSERT INTO TEMPLATE(template_id, current_version) VALUES (?, 1)', [template.template_id]);
      await db.run('INSERT INTO TEMPLATE_VERSION(template_id, template_version, payload_json) VALUES (?, 1, ?)', [template.template_id, JSON.stringify(template)]);
      await db.exec('COMMIT');
      return structuredClone(template);
    } catch (error) { await db.exec('ROLLBACK'); throw error; }
  });
}

async function cloneAndCreate(id, name) {
  const source = await getTemplate(id);
  if (!source) throw new TemplateError(404, 'Không tìm thấy mẫu');
  return createTemplate(cloneTemplate(source, name));
}

async function updateTemplate(id, proposed, expectedVersion) {
  if (getSeed(id)) throw new TemplateError(403, 'Mẫu gốc chỉ đọc; hãy tạo bản sao');
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new TemplateError(400, 'Thiếu expected_version hợp lệ');
  return withLock(async () => {
    const db = await getDb();
    try {
      await db.exec('BEGIN IMMEDIATE');
      const row = await db.get('SELECT current_version FROM TEMPLATE WHERE template_id = ? AND deleted_at IS NULL', [id]);
      if (!row) throw new TemplateError(404, 'Không tìm thấy mẫu');
      if (row.current_version !== expectedVersion) throw new TemplateError(409, 'Mẫu đã thay đổi; tải lại trước khi lưu');
      const next = { ...proposed, schema_version: 1, template_id: id, origin: 'user', is_builtin: false, template_version: row.current_version + 1 };
      assertValid(next);
      await db.run('INSERT INTO TEMPLATE_VERSION(template_id, template_version, payload_json) VALUES (?, ?, ?)', [id, next.template_version, JSON.stringify(next)]);
      await db.run(`UPDATE TEMPLATE SET current_version = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE template_id = ?`, [next.template_version, id]);
      await db.exec('COMMIT');
      return next;
    } catch (error) { await db.exec('ROLLBACK'); throw error; }
  });
}

async function deleteTemplate(id) {
  if (getSeed(id)) throw new TemplateError(403, 'Không thể xóa mẫu gốc');
  return withLock(async () => {
    const db = await getDb();
    const result = await db.run(`UPDATE TEMPLATE SET deleted_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE template_id = ? AND deleted_at IS NULL`, [id]);
    if (!result.changes) throw new TemplateError(404, 'Không tìm thấy mẫu');
  });
}

module.exports = { TemplateError, cloneTemplate, listTemplates, getTemplate, createTemplate, cloneAndCreate, updateTemplate, deleteTemplate };
