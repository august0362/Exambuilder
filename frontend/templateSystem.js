import { syncCorrectOption, templateToBlocks, templateBinding, templateExportInput } from './examFrames.js';

// Template workspace is isolated from the legacy editor; only an explicit
// "Open in exam editor" action hands its current slots to the existing flow.
const launchButton = document.getElementById('templateSystemBtn');
const dialog = document.createElement('dialog');
dialog.className = 'template-dialog';
dialog.setAttribute('aria-label', 'Thư viện mẫu đề');
document.body.append(dialog);

const ui = { template: null, selected: null, templates: [], dirty: false, draft: null };
const types = { MCQ: 'Trắc nghiệm', TRUE_FALSE: 'Đúng/Sai', FILL_BLANK: 'Điền từ', ESSAY: 'Tự luận' };
const groups = { FULL_EXAM: 'Tạo toàn bộ đề', SELECTED_SLOTS: 'Tạo phần/slot được chọn', REVIEW_REPAIR: 'Kiểm tra/sửa câu chọn' };
const variants = ['ChatGPT', 'Claude', 'Gemini', 'DeepSeek', 'Grok'];

function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text != null) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function button(text, fn, className = '') {
  const el = node('button', text, className);
  el.type = 'button';
  el.addEventListener('click', fn);
  return el;
}
function field(label, value, onChange, type = 'text', attrs = {}) {
  const wrap = node('label', label, 'template-field');
  const el = type === 'textarea' ? node('textarea') : node('input');
  if (type !== 'textarea') el.type = type;
  el.value = value ?? '';
  for (const [key, val] of Object.entries(attrs)) el.setAttribute(key, val);
  el.addEventListener('change', () => onChange(el.value));
  wrap.append(el);
  return wrap;
}
function select(label, value, options, onChange) {
  const wrap = node('label', label, 'template-field');
  const el = node('select');
  options.forEach(([v, title]) => { const option = node('option', title); option.value = v; el.append(option); });
  el.value = value;
  el.addEventListener('change', () => onChange(el.value));
  wrap.append(el);
  return wrap;
}
function status(message, error = false) {
  const el = dialog.querySelector('.template-status');
  if (el) { el.textContent = message; el.classList.toggle('error', error); }
}
// Toast nam TRONG dialog: dialog mo bang showModal() o top layer nen toast
// #copyToast cua trang chinh bi che mat.
let toastTimer = null;
function toast(message, error = false) {
  status(message, error);
  const el = dialog.querySelector('.template-toast');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('error', error);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 5000);
}
async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  } catch {
    // fetch chi nem khi khong toi duoc may chu (server tat/crash), khong phai loi HTTP.
    throw new Error('Không kết nối được máy chủ ExamBuilder. Hãy đóng cửa sổ ExamBuilder rồi chạy lại Chay_ExamBuilder.bat, sau đó tải lại trang.');
  }
  const data = await response.json();
  if (!response.ok || data.success === false) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
function allSlots(template = ui.template) { return template.sections.flatMap(section => section.slots.map(slot => ({ section, slot }))); }
function scoreLabel() {
  const total = allSlots().reduce((n, { slot }) => n + Math.round(Number(slot.points || 0) * 100), 0) / 100;
  const target = Number(ui.template.defaults?.total_points ?? 10);
  return `Tổng điểm: ${total.toFixed(2)} / ${target.toFixed(2)}${Math.abs(total - target) > 0.001 ? ' — cần kiểm tra' : ''}`;
}
function syncScores() {
  for (const section of ui.template.sections) {
    section.slots.forEach((slot, index) => { slot.position = index; });
    section.declared_points = (section.slots.reduce((n, slot) => n + Math.round(Number(slot.points) * 100), 0) / 100).toFixed(2);
  }
}
const toCents = value => Math.round(Number(value || 0) * 100);
const sectionCents = section => section.slots.reduce((n, slot) => n + toCents(slot.points), 0);
// Chia `cents` (don vi 0,01) deu cho n cau; phan du 0,01 cong lan luot vao
// cac cau CUOI de cau dau giu so tron.
function spreadSection(section, cents) {
  const n = section.slots.length;
  const base = Math.floor(cents / n), remainder = cents - base * n;
  section.slots.forEach((slot, index) => { slot.points = ((base + (index >= n - remainder ? 1 : 0)) / 100).toFixed(2); });
}
// Reset diem: moi phan giu ty trong diem hien co (quy ve dung thang diem de,
// vd TN 4 + TL 6 = 10), roi chia DEU cho cac cau TRONG tung phan.
function resetPoints() {
  const t = ui.template;
  const total = toCents(t.defaults?.total_points ?? 10);
  const slotCount = allSlots().length;
  if (!slotCount || !Number.isFinite(total) || total < slotCount) { toast('Thang điểm quá nhỏ để chia cho số câu hiện có (tối thiểu 0,01/câu).', true); return; }
  if (!confirm(`Chia lại ${(total / 100).toFixed(2)} điểm đều cho các câu trong từng phần? Điểm hiện tại sẽ bị thay.`)) return;
  const sums = t.sections.map(sectionCents);
  const weights = sums.some(Boolean) ? sums : t.sections.map(section => section.slots.length);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  let left = total;
  t.sections.forEach((section, index) => {
    const rest = t.sections.slice(index + 1).reduce((n, s) => n + s.slots.length, 0);
    const budget = index === t.sections.length - 1 ? left
      : Math.min(left - rest, Math.max(section.slots.length, Math.round(total * weights[index] / weightSum)));
    spreadSection(section, budget);
    left -= budget;
  });
  syncScores(); markDirty();
  toast(`Đã chia đều điểm: ${t.sections.map(s => `${s.title} ${s.declared_points} đ (${s.slots.length} câu)`).join(' · ')}.`);
}
// Giao vien chi can nhap so cau cua phan: them/bot cau o CUOI phan roi chia
// deu lai diem cua phan (tong diem phan giu nguyen nen tong de khong doi).
function setSectionCount(section, value) {
  const count = Math.floor(Number(value));
  if (!Number.isFinite(count) || count < 1 || count > 100) { toast('Số câu mỗi phần phải từ 1 đến 100.', true); renderEditor(); return; }
  if (count === section.slots.length) return;
  if (ui.template.is_builtin) {
    if (confirm('Mẫu gốc giữ cố định số câu. Tạo Bản sao tùy chỉnh để đổi số câu ngay bây giờ không?')) {
      const sectionIndex = ui.template.sections.indexOf(section);
      cloneTemplate().then(() => { if (!ui.template.is_builtin) setSectionCount(ui.template.sections[sectionIndex], count); });
    } else renderEditor();
    return;
  }
  const budget = sectionCents(section) || count * (section.kind === 'ESSAY' ? 100 : 50);
  if (budget < count) { toast(`Phần này chỉ có ${(budget / 100).toFixed(2)} điểm, không đủ chia cho ${count} câu.`, true); renderEditor(); return; }
  if (count < section.slots.length) {
    const removed = section.slots.slice(count);
    if (removed.some(slot => slot.content?.content?.trim()) &&
      !confirm(`Bớt ${removed.length} câu cuối của ${section.title}? Nội dung đã có trong các câu đó sẽ mất.`)) { renderEditor(); return; }
    section.slots.length = count;
    removed.forEach(slot => ui.promptSelection?.delete(slot.slot_id));
    if (removed.some(slot => slot.slot_id === ui.selected)) ui.selected = section.slots.at(-1).slot_id;
  }
  while (section.slots.length < count) section.slots.push(newSlot(section));
  spreadSection(section, budget);
  syncScores(); markDirty();
  toast(`${section.title}: ${count} câu, mỗi câu khoảng ${(budget / count / 100).toFixed(2)} điểm (tổng phần ${(budget / 100).toFixed(2)}).`);
}
function markDirty() { ui.dirty = true; ui.draft = null; renderEditor(); }
async function loadGallery() {
  try {
    const data = await api('/api/templates');
    ui.templates = data.templates;
    renderGallery();
  } catch (err) { status(err.message, true); }
}
function renderShell() {
  dialog.replaceChildren();
  const top = node('div', null, 'template-top');
  top.append(node('h2', 'Thư viện mẫu đề'), button('Đóng', () => dialog.close()));
  const statusBar = node('div', null, 'template-status');
  statusBar.setAttribute('aria-live', 'polite');
  dialog.append(top, statusBar);
  dialog.append(node('div', null, 'template-gallery'));
  dialog.append(node('div', null, 'template-editor'));
  const toastEl = node('div', null, 'copy-toast template-toast');
  toastEl.setAttribute('role', 'status');
  dialog.append(toastEl);
}
function renderGallery() {
  const gallery = dialog.querySelector('.template-gallery');
  gallery.replaceChildren();
  const search = node('input'); search.placeholder = 'Tìm mẫu đề'; search.setAttribute('aria-label', 'Tìm mẫu đề');
  const importFile = node('input'); importFile.type = 'file'; importFile.accept = '.json,application/json';
  const importButton = button('Nhập mẫu JSON', async () => {
    const file = importFile.files[0];
    if (!file) { status('Chọn file JSON mẫu trước khi nhập.', true); return; }
    if (file.size > 1024 * 1024) { status('File mẫu vượt 1 MiB.', true); return; }
    try {
      const imported = JSON.parse(await file.text());
      const template = imported.template || imported;
      template.template_id = `user.${crypto.randomUUID()}`;
      template.template_version = 1; template.origin = 'user'; template.is_builtin = false;
      const data = await api('/api/templates', { method: 'POST', body: JSON.stringify({ template }) });
      await loadGallery(); await openTemplate(data.template.template_id);
      status('Đã nhập cấu trúc mẫu. Asset tham chiếu cần có sẵn trong thư viện nền của máy này.');
    } catch (err) { status(err.message, true); }
  });
  const origin = node('select'); origin.setAttribute('aria-label', 'Lọc nguồn mẫu');
  [['', 'Tất cả mẫu'], ['builtin', 'Mẫu gốc'], ['user', 'Mẫu của tôi']].forEach(([value, title]) => { const option = node('option', title); option.value = value; origin.append(option); });
  const grid = node('div', null, 'template-grid');
  const draw = () => {
    grid.replaceChildren();
    const query = search.value.toLocaleLowerCase('vi');
    ui.templates.filter(t => (!origin.value || t.origin === origin.value) &&
      `${t.display_name} ${t.description || ''} ${t.category || ''} ${t.defaults?.subject || ''}`.toLocaleLowerCase('vi').includes(query)).forEach(t => {
      const card = node('div', null, 'template-card');
      card.append(node('strong', t.display_name), node('span', `${t.sections.length} phần · ${allSlots(t).length} câu · ${t.is_builtin ? 'Mẫu gốc' : 'Tùy chỉnh'}`));
      card.append(button('Mở mẫu', () => openTemplate(t.template_id)));
      grid.append(card);
    });
  };
  search.addEventListener('input', draw);
  origin.addEventListener('change', draw);
  gallery.append(search, origin, importFile, importButton, grid);
  draw();
}
async function openTemplate(id) {
  if (ui.dirty && !confirm('Bỏ các thay đổi chưa lưu?')) return;
  try {
    const data = await api(`/api/templates/${encodeURIComponent(id)}`);
    ui.template = data.template;
    ui.backgroundUrl = null;
    ui.selected = allSlots()[0]?.slot.slot_id || null;
    ui.promptSelection = new Set();
    ui.promptGroup = 'FULL_EXAM'; ui.aiVariant = 'ChatGPT'; ui.repairIntent = 'rewrite-one';
    ui.dirty = false;
    ui.draft = null;
    ui.undo = null;
    dialog.querySelector('.template-gallery').hidden = true;
    renderEditor();
    status('Đã mở mẫu. Mẫu gốc giữ cố định số phần và số câu.');
  } catch (err) { status(err.message, true); }
}
function selectedSlot() { return allSlots().find(({ slot }) => slot.slot_id === ui.selected)?.slot; }
function reorder(direction) {
  for (const section of ui.template.sections) {
    const index = section.slots.findIndex(slot => slot.slot_id === ui.selected);
    const next = index + direction;
    if (index >= 0 && next >= 0 && next < section.slots.length) {
      [section.slots[index], section.slots[next]] = [section.slots[next], section.slots[index]];
      syncScores();
      markDirty(); return;
    }
  }
}
function addSlotToSection(targetSection) {
  if (ui.template.is_builtin) {
    if (confirm('Mẫu gốc giữ cố định số câu ban đầu. Bạn có muốn tạo Bản sao tùy chỉnh để thêm câu ngay bây giờ không?')) {
      const sectionIndex = Math.max(0, ui.template.sections.indexOf(targetSection));
      cloneTemplate().then(() => {
        // Clone that bai thi ui.template van la mau goc: dung lai, khong hoi lap.
        if (!ui.template.is_builtin) addSlotToSection(ui.template.sections[sectionIndex]);
      });
    }
    return;
  }
  const section = targetSection || ui.template.sections[0];
  if (!section) return;
  const slot = newSlot(section);
  section.slots.push(slot);
  ui.selected = slot.slot_id;
  syncScores();
  markDirty();
}
// Cau moi theo loai cua phan (TN/Tu luan), chep loai cau/vung tra loi cua cau
// cuoi phan neu co de phan giu dong nhat.
function newSlot(section) {
  const isEssay = section.kind === 'ESSAY';
  const last = section.slots.at(-1);
  return {
    slot_id: `slot.${crypto.randomUUID()}`,
    position: section.slots.length,
    question_type: last?.question_type || (isEssay ? 'ESSAY' : 'MCQ'),
    difficulty_level: 'NB',
    points: isEssay ? '1.00' : '0.50',
    required: true,
    answer_space: last?.answer_space ? structuredClone(last.answer_space) : isEssay
      ? { kind: 'lined', lines: 4, min_lines: 2, max_lines: 12, auto_expand: true }
      : { kind: 'none', lines: 0, min_lines: 0, max_lines: 0, auto_expand: false },
    content: {},
    assets: []
  };
}

function addSlot() {
  const currentSlot = selectedSlot();
  const currentSection = currentSlot ? ui.template.sections.find(s => s.slots.includes(currentSlot)) : null;
  addSlotToSection(currentSection || ui.template.sections[0]);
}
function renderEditor() {
  const root = dialog.querySelector('.template-editor');
  root.replaceChildren();
  if (!ui.template) return;
  const t = ui.template, editable = !t.is_builtin;
  const header = node('div', null, 'template-editor-header');
  header.append(node('h3', t.display_name), node('span', scoreLabel()));
  header.append(button('Xuất mẫu JSON', () => {
    const blob = new Blob([JSON.stringify({ format: 'exambuilder-template', template: t }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = node('a'); link.href = url; link.download = `${t.template_id}.json`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }));
  header.append(button('Chọn mẫu khác', () => {
    const gallery = dialog.querySelector('.template-gallery'); gallery.hidden = false; gallery.scrollIntoView({ block: 'start' });
  }));
  header.append(button('Tạo bản sao tùy chỉnh', cloneTemplate));
  header.append(button('+ Thêm câu', addSlot));
  if (editable) {
    header.append(button('Lưu', saveTemplate), button('Reset điểm', resetPoints), button('Thêm phần', () => {
      const section_id = `section.${crypto.randomUUID()}`;
      t.sections.push({ section_id, title: `Phần ${t.sections.length + 1}`, kind: 'ESSAY', declared_points: '1.00',
        layout: { columns: 1, keep_heading_with_next: true }, slots: [{ slot_id: `${section_id}.q001`, position: 0,
          question_type: 'ESSAY', difficulty_level: 'NB', points: '1.00', required: true,
          answer_space: { kind: 'lined', lines: 4, min_lines: 2, max_lines: 12, auto_expand: true }, content: null, assets: [] }] });
      syncScores(); ui.selected = t.sections.at(-1).slots[0].slot_id; markDirty();
    }), button('Xóa mẫu', deleteTemplate));
  }
  header.append(button('Mở trong trình soạn đề', openInLegacy));
  root.append(header);
  const settings = node('details', null, 'template-settings');
  settings.append(node('summary', 'Thông tin đề và thiết lập trang'));
  if (editable) settings.append(field('Tên đề', t.display_name, value => { t.display_name = value; ui.dirty = true; renderEditor(); }));
  const updateDefault = (key, value) => { t.defaults[key] = value; ui.dirty = editable; ui.refreshPrompt?.(); };
  settings.append(field('Tiêu đề đề đang soạn', t.defaults.exam_title || t.display_name, value => updateDefault('exam_title', value)));
  settings.append(field('Môn học', t.defaults.subject, value => updateDefault('subject', value)));
  settings.append(field('Lớp', t.defaults.grade, value => updateDefault('grade', value)));
  settings.append(field('Chủ đề', t.defaults.topic, value => updateDefault('topic', value)));
  settings.append(field('Trường', t.defaults.school_header, value => updateDefault('school_header', value)));
  settings.append(field('Thời gian (phút)', t.defaults.duration_minutes, value => updateDefault('duration_minutes', Number(value)), 'number', { min: '1' }));
  if (editable) {
    settings.append(field('Thang điểm đề', t.defaults.total_points, value => { t.defaults.total_points = Number(value).toFixed(2); markDirty(); }, 'number', { min: '0.01', step: '0.01' }));
    settings.append(select('Khổ giấy', t.appearance.paper, [['A4','A4'],['A5','A5']], value => { t.appearance.paper = value; markDirty(); }));
    settings.append(select('Chiều giấy', t.appearance.orientation, [['portrait','Dọc'],['landscape','Ngang']], value => { t.appearance.orientation = value; markDirty(); }));
    settings.append(select('Phân trang', t.pagination.mode, [['auto','Tự động'],['max_pages','Giới hạn số trang']], value => { t.pagination.mode = value; t.pagination.max_pages = value === 'max_pages' ? 2 : null; markDirty(); }));
    if (t.pagination.mode === 'max_pages') settings.append(field('Số trang tối đa', t.pagination.max_pages, value => { t.pagination.max_pages = Number(value); ui.dirty = true; }, 'number', { min: '1', max: '100' }));
    t.appearance.margins_mm ||= { top: 18, bottom: 18, left: 18, right: 18 };
    for (const [key, label] of [['top','Lề trên (mm)'],['bottom','Lề dưới (mm)'],['left','Lề trái (mm)'],['right','Lề phải (mm)']]) {
      settings.append(field(label, t.appearance.margins_mm[key], value => {
        t.appearance.margins_mm[key] = Math.max(5, Math.min(40, Number(value) || 18)); markDirty();
      }, 'number', { min: '5', max: '40' }));
    }
    settings.append(select('Số cột', String(t.appearance.columns || 1), [['1','Một cột'],['2','Hai cột']], value => { t.appearance.columns = Number(value); markDirty(); }));
    t.appearance.header ||= { enabled: true, fields: ['school', 'exam_title'] };
    t.appearance.footer ||= { enabled: true, fields: ['page_number'] };
    settings.append(select('Header', t.appearance.header.enabled ? 'on' : 'off', [['on','Có (trường, tên đề)'],['off','Không']], value => { t.appearance.header.enabled = value === 'on'; markDirty(); }));
    settings.append(select('Footer số trang', t.appearance.footer.enabled ? 'on' : 'off', [['on','Có'],['off','Không']], value => { t.appearance.footer.enabled = value === 'on'; markDirty(); }));
    t.appearance.background ||= { asset_id: null, opacity: 0.12, fit: 'contain', apply_to: 'all' };
    settings.append(field('Độ đậm nền (0,05–1)', t.appearance.background.opacity ?? 0.12, value => {
      t.appearance.background.opacity = Math.max(0.05, Math.min(1, Number(value) || 0.12)); markDirty();
    }, 'number', { min: '0.05', max: '1', step: '0.05' }));
    settings.append(select('Nền áp dụng cho', t.appearance.background.apply_to || 'all', [['all','Mọi trang'],['first','Chỉ trang đầu']], value => { t.appearance.background.apply_to = value; markDirty(); }));
    settings.append(button('Reset điểm (chia đều trong từng phần)', resetPoints));
  }
  root.append(settings);
  renderAssetPanel(root);
  const columns = node('div', null, 'template-columns');
  const list = node('div', null, 'template-list');
  for (const section of t.sections) {
    const sectionBox = node('section');
    sectionBox.append(node('h4', `${section.title} · ${section.declared_points} điểm`));
    sectionBox.append(field('Số câu (tự chia đều điểm của phần)', section.slots.length, value => setSectionCount(section, value), 'number', { min: '1', max: '100' }));
    if (section.stimulus != null || editable) sectionBox.append(field('Ngữ liệu/đoạn đọc của phần', section.stimulus || '', value => {
      section.stimulus = value; ui.dirty = editable; ui.refreshPrompt?.();
    }, 'textarea'));
    sectionBox.append(button('Chọn phần cho prompt', () => {
      ui.promptSelection ||= new Set();
      section.slots.forEach(slot => ui.promptSelection.add(slot.slot_id));
      renderEditor();
    }));
    if (editable) {
      sectionBox.append(button('+ Thêm câu vào phần này', () => addSlotToSection(section)));
      sectionBox.append(button('Sửa tên phần', () => {
        const value = prompt('Tên phần', section.title);
        if (value?.trim()) { section.title = value.trim(); markDirty(); }
      }));
      if (t.sections.length > 1) sectionBox.append(button('Xóa phần', () => {
        if (!confirm(`Xóa ${section.title} và mọi câu trong phần?`)) return;
        t.sections.splice(t.sections.indexOf(section), 1);
        syncScores(); ui.selected = allSlots()[0]?.slot.slot_id || null; markDirty();
      }));
    } else {
      sectionBox.append(button('+ Thêm câu', () => addSlotToSection(section)));
    }
    section.slots.forEach((slot, index) => {
      const row = button(`${index + 1}. ${types[slot.question_type] || slot.question_type} · ${slot.points} điểm`, () => { ui.selected = slot.slot_id; ui.draft = null; renderEditor(); }, slot.slot_id === ui.selected ? 'selected' : '');
      const pick = node('label', null, 'template-prompt-pick');
      const box = node('input'); box.type = 'checkbox'; box.checked = ui.promptSelection?.has(slot.slot_id) || false;
      box.setAttribute('aria-label', `Chọn ${slot.slot_id} cho prompt`);
      box.addEventListener('change', () => {
        ui.promptSelection ||= new Set();
        if (box.checked) ui.promptSelection.add(slot.slot_id); else ui.promptSelection.delete(slot.slot_id);
        ui.draft = null;
        ui.refreshPrompt?.();
      });
      pick.append(box, row); sectionBox.append(pick);
    });
    list.append(sectionBox);
  }
  const inspector = node('div', null, 'template-inspector');
  const slot = selectedSlot();
  if (slot) {
    inspector.append(node('h4', `Thuộc tính câu · ${slot.slot_id}`));
    if (editable) {
      inspector.append(select('Loại câu', slot.question_type, Object.entries(types), value => { slot.question_type = value; markDirty(); }));
      inspector.append(field('Điểm', slot.points, value => {
        slot.points = Number(value).toFixed(2);
        syncScores();
        markDirty();
      }, 'number', { min: '0.01', step: '0.01' }));
      inspector.append(select('Mức độ', slot.difficulty_level, [['NB','Nhận biết'],['TH','Thông hiểu'],['VD','Vận dụng'],['VDC','Vận dụng cao']], value => { slot.difficulty_level = value; markDirty(); }));
      inspector.append(select('Vùng trả lời', slot.answer_space?.kind || 'lined', [['none','Không có'],['lined','Dòng kẻ'],['blank','Vùng trống'],['squared','Ô ly'],['table','Bảng'],['drawing','Khung vẽ']], value => { slot.answer_space.kind = value; markDirty(); }));
      inspector.append(field('Số dòng', slot.answer_space?.lines || 0, value => {
        const lines = Number(value); slot.answer_space.lines = lines;
        slot.answer_space.min_lines = Math.min(slot.answer_space.min_lines, lines);
        slot.answer_space.max_lines = Math.max(slot.answer_space.max_lines, lines);
        markDirty();
      }, 'number', { min: '0', max: '100' }));
    } else inspector.append(node('p', `${types[slot.question_type]} · ${slot.points} điểm · ${slot.answer_space?.lines || 0} dòng`));
    slot.content ||= {};
    const pages = t.appearance.background?.pages || [];
    if (pages.length) {
      inspector.append(node('h4', 'Vùng điền trên PDF nền'));
      // Chi tao vung khi giao vien chu dong gan: chon slot de xem khong duoc
      // tu dat cau vao toa do mac dinh tren trang nen.
      const region = slot.manual_region;
      if (!region) {
        inspector.append(node('p', 'Câu này xuất theo luồng văn bản, chưa gắn vào vị trí trên trang nền.'),
          button('Gắn vùng trên trang nền', () => {
            slot.manual_region = { page_number: Number(pages[0].page_number) || 1, x_pct: 10, y_pct: 10, width_pct: 80, height_pct: 10 };
            markDirty();
          }));
      } else {
        inspector.append(select('Trang', String(region.page_number), pages.map(page => [String(page.page_number), `Trang ${page.page_number}`]), value => { region.page_number = Number(value); markDirty(); }));
        for (const [key, label] of [['x_pct','X (%)'],['y_pct','Y (%)'],['width_pct','Rộng (%)'],['height_pct','Cao (%)']]) {
          inspector.append(field(label, region[key], value => { region[key] = Math.max(0, Math.min(100, Number(value))); markDirty(); }, 'number', { min: '0', max: '100', step: '1' }));
        }
        inspector.append(button('Bỏ vùng (xuất theo luồng văn bản)', () => { delete slot.manual_region; markDirty(); }));
      }
    }
    inspector.append(field('Đề bài', slot.content.content || '', value => { slot.content.content = value; ui.dirty = editable; ui.draft = null; }, 'textarea'));
    if (slot.question_type === 'MCQ') inspector.append(field('Lựa chọn A–D (mỗi dòng một lựa chọn)',
      (slot.content.options || []).map(option => option.option_text || '').join('\n'), value => {
        slot.content.options = value.split('\n').slice(0, 4).map((text, index) => ({ option_key: 'ABCD'[index], option_text: text.trim(), is_correct: false }));
        syncCorrectOption(slot.content);
        ui.dirty = editable; ui.draft = null;
      }, 'textarea'));
    inspector.append(field('Đáp án', slot.content.correct_answer || '', value => {
      slot.content.correct_answer = slot.question_type === 'MCQ' ? value.trim().toUpperCase() : value;
      syncCorrectOption(slot.content);
      ui.dirty = editable; ui.draft = null;
    }, 'textarea'));
    inspector.append(field('Lời giải', slot.content.explanation || '', value => { slot.content.explanation = value; ui.dirty = editable; ui.draft = null; }, 'textarea'));
    if (editable) {
      inspector.append(button('↑', () => reorder(-1)), button('↓', () => reorder(1)), button('Xóa câu', () => {
        const section = t.sections.find(s => s.slots.includes(slot));
        if (section.slots.length === 1) { status('Mỗi phần cần ít nhất một câu; hãy xóa cả phần nếu không dùng.', true); return; }
        section.slots.splice(section.slots.indexOf(slot), 1);
        ui.selected = allSlots()[0]?.slot.slot_id || null; syncScores(); markDirty();
      }));
    } else inspector.append(node('p', 'Sao mẫu để đổi cấu trúc. Nội dung vừa điền dùng được khi mở trong trình soạn đề.'));
  }
  columns.append(list, inspector);
  root.append(columns);
  renderPaperPreview(root);
  renderPromptPanel(root);
}
function applyPaperBackground(paper) {
  const bg = ui.template.appearance?.background || {};
  paper.classList.toggle('has-bg', Boolean(ui.backgroundUrl));
  paper.style.setProperty('--template-bg', ui.backgroundUrl ? `url("${ui.backgroundUrl.replace(/["\\\n]/g, encodeURIComponent)}")` : 'none');
  paper.style.setProperty('--template-bg-opacity', String(bg.opacity ?? 0.12));
  paper.style.setProperty('--template-bg-fit', bg.fit === 'cover' ? 'cover' : 'contain');
}
function renderPaperPreview(root) {
  const t = ui.template;
  const preview = node('section', null, 'template-paper-wrap');
  const controls = node('div', null, 'template-preview-controls');
  controls.append(node('h4', 'Xem trước trang đề'));
  const view = select('Hiển thị', ui.previewMode || 'student', [['student','Học sinh'],['teacher','Giáo viên'],['answer_key','Đáp án'],['combined','Đề và đáp án cuối']], value => { ui.previewMode = value; renderEditor(); });
  controls.append(view);
  const paper = node('div', null, `template-paper ${t.appearance.paper === 'A5' ? 'a5' : 'a4'} ${t.appearance.orientation === 'landscape' ? 'landscape' : ''}`);
  applyPaperBackground(paper);
  const mode = ui.previewMode || 'student';
  paper.append(node('div', t.defaults.school_header || 'Tên trường'), node('h3', t.defaults.exam_title || t.display_name),
    node('p', `${t.defaults.subject || 'Môn học'} · ${t.defaults.grade || 'Lớp'} · ${t.defaults.duration_minutes || ''} phút`));
  for (const section of t.sections) {
    paper.append(node('h4', `${section.title} (${section.declared_points} điểm)`));
    if (section.stimulus) paper.append(node('p', section.stimulus));
    const area = node('div', section.layout?.columns === 2 ? null : null, section.layout?.columns === 2 ? 'template-paper-two-cols' : '');
    section.slots.forEach((slot, index) => {
      const card = node('button', null, 'template-paper-slot'); card.type = 'button';
      card.classList.toggle('selected', slot.slot_id === ui.selected);
      card.append(node('strong', `Câu ${index + 1} (${slot.points} điểm)`));
      if (mode !== 'answer_key') card.append(node('p', slot.content?.content || '[Chưa có đề bài]'));
      if (mode !== 'answer_key' && slot.content?.options) slot.content.options.forEach(option => card.append(node('div', `${option.option_key}. ${option.option_text}`)));
      if ((mode === 'student' || mode === 'combined') && slot.answer_space?.lines > 0) {
        const lines = node('div', null, `template-answer-space ${slot.answer_space.kind}`);
        for (let n = 0; n < Math.min(slot.answer_space.lines, 12); n++) lines.append(node('div', ''));
        card.append(lines);
      }
      if (mode === 'teacher' || mode === 'answer_key') card.append(node('p', `Đáp án: ${slot.content?.correct_answer || '[chưa có]'}`),
        node('p', `Lời giải: ${slot.content?.explanation || '[chưa có]'}`));
      card.addEventListener('click', () => { ui.selected = slot.slot_id; ui.draft = null; renderEditor(); });
      area.append(card);
    });
    paper.append(area);
  }
  if (mode === 'combined') {
    const key = node('section', null, 'template-combined-key'); key.append(node('h3', 'Đáp án và hướng dẫn chấm'));
    allSlots().forEach(({ slot }, i) => key.append(node('p', `Câu ${i + 1} (${slot.points} điểm): ${slot.content?.correct_answer || '[chưa có]'} — ${slot.content?.explanation || '[chưa có]'}`)));
    paper.append(key);
  }
  preview.append(controls, paper);
  root.append(preview);
}
function renderAssetPanel(root) {
  const panel = node('details', null, 'template-settings');
  panel.append(node('summary', 'Nền và nhập Word/PDF'));
  const imageList = node('select'); imageList.setAttribute('aria-label', 'Thư viện ảnh nền');
  imageList.append(Object.assign(node('option', 'Không dùng nền'), { value: '' }));
  imageList.addEventListener('change', () => {
    ui.template.appearance.background ||= {};
    ui.template.appearance.background.asset_id = imageList.value || null;
    const selectedAsset = ui.assetMetadata?.get(imageList.value);
    ui.template.appearance.background.asset_manifest = selectedAsset ? [selectedAsset] : [];
    ui.backgroundUrl = imageList.selectedOptions[0]?.dataset.url || null;
    ui.dirty = !ui.template.is_builtin; renderEditor();
  });
  const loadAssets = async () => {
    try {
      const data = await api('/api/backgrounds/assets');
      ui.assetMetadata = new Map(data.assets.map(asset => [asset.asset_id, asset]));
      imageList.replaceChildren(Object.assign(node('option', 'Không dùng nền'), { value: '' }));
      data.assets.filter(a => a.mime?.startsWith('image/')).forEach(a => {
        const option = node('option', a.original_name || a.filename);
        option.value = a.asset_id; option.dataset.url = a.url; imageList.append(option);
      });
      imageList.value = ui.template.appearance.background?.asset_id || '';
      ui.backgroundUrl = imageList.selectedOptions[0]?.dataset.url || null;
      const paper = root.querySelector('.template-paper');
      if (paper) applyPaperBackground(paper);
    } catch (err) { status(err.message, true); }
  };
  const imageInput = node('input'); imageInput.type = 'file'; imageInput.accept = '.png,.jpg,.jpeg,.webp,.svg';
  const documentInput = node('input'); documentInput.type = 'file'; documentInput.accept = '.docx,.pdf';
  const result = node('pre', '', 'template-report');
  result.textContent = ui.importMessage || '';
  const importMode = select('Cách nhập tài liệu', 'structure', [['structure','Nhận diện cấu trúc và duyệt'],['background','Dùng file làm nền và đánh dấu vùng thủ công']], () => {});
  const suggestions = node('div', null, 'template-import-review');
  const pagePreview = node('div', null, 'template-pdf-pages');
  const drawPages = () => {
    pagePreview.replaceChildren();
    const pages = ui.template.appearance.background?.pages || [];
    pages.forEach(page => {
      const wrapper = node('div', null, 'template-pdf-page');
      const img = node('img'); img.src = page.url; img.alt = `Trang nền PDF ${page.page_number}`;
      wrapper.append(img);
      allSlots().filter(({ slot }) => slot.manual_region?.page_number === page.page_number).forEach(({ slot }) => {
        const r = slot.manual_region;
        const marker = button(slot.slot_id, () => { ui.selected = slot.slot_id; renderEditor(); }, 'template-region-marker');
        marker.style.left = `${r.x_pct}%`; marker.style.top = `${r.y_pct}%`;
        marker.style.width = `${r.width_pct}%`; marker.style.height = `${r.height_pct}%`;
        wrapper.append(marker);
      });
      pagePreview.append(node('p', `Trang ${page.page_number}: chọn slot rồi chỉnh X/Y/Rộng/Cao ở bảng thuộc tính.`), wrapper);
    });
  };
  panel.append(node('p', 'Ảnh nền tải lên từ máy hoặc chọn trong thư viện.'), imageList, imageInput,
    button('Tải ảnh nền', async () => {
      if (!imageInput.files[0]) { status('Chọn ảnh trước khi tải.', true); return; }
      const form = new FormData(); form.append('file', imageInput.files[0]);
      try {
        const response = await fetch('/api/backgrounds/upload', { method: 'POST', body: form });
        const data = await response.json(); if (!response.ok) throw new Error(data.error);
        ui.template.appearance.background ||= {}; ui.template.appearance.background.asset_id = data.asset.asset_id;
        ui.template.appearance.background.asset_manifest = [data.asset];
        ui.backgroundUrl = data.asset.url; ui.dirty = !ui.template.is_builtin;
        await loadAssets(); renderEditor(); status('Đã tải ảnh nền. Lưu bản sao để giữ nền; DOCX nhúng ảnh nhưng độ mờ trong Word có thể khác bản web.');
      } catch (err) { status(err.message, true); }
    }), node('p', 'Word/PDF có hai cách nhập riêng. PDF scan không được nhận diện chữ; không có OCR.'),
    importMode, documentInput, button('Nhập tài liệu', async () => {
      if (!documentInput.files[0]) { status('Chọn DOCX/PDF trước khi nhập.', true); return; }
      const form = new FormData(); form.append('file', documentInput.files[0]); form.append('mode', importMode.querySelector('select').value);
      try {
        const response = await fetch('/api/backgrounds/import', { method: 'POST', body: form });
        const data = await response.json(); if (!response.ok) throw new Error(data.error);
        result.textContent = `Tệp: ${data.asset.original_name}\n${data.warnings.join('\n')}\nCần giáo viên duyệt trước khi đưa vào đề.`;
        suggestions.replaceChildren();
        if (data.mode === 'structure') {
          for (const section of data.sections || []) {
            suggestions.append(node('h4', section.title));
            for (const question of section.questions || []) {
              const editor = field('Nội dung nhận diện (hãy sửa rồi gắn vào slot)', question.text || question.content || String(question), () => {}, 'textarea');
              suggestions.append(editor, button('Gắn vào slot đang chọn', () => {
                const slot = selectedSlot(); if (!slot) return;
                slot.content ||= {}; slot.content.content = editor.querySelector('textarea').value;
                ui.dirty = !ui.template.is_builtin; status('Đã gắn nội dung sau khi duyệt. Chọn slot tiếp theo để tiếp tục.');
              }));
            }
          }
        } else {
          ui.template.appearance.background ||= {};
          ui.template.appearance.background.source_asset_id = data.asset.asset_id;
          ui.template.appearance.background.pages = data.background_pages || [];
          ui.template.appearance.background.asset_manifest = [
            { ...data.asset, role: 'source_document', transfer: 'reference_only' },
            ...(data.background_pages || []).map(page => ({ ...page, asset_id: page.asset_id, sha256: page.sha256 || page.asset_id.slice(6), mime: page.mime || 'image/png', role: 'page_background', transfer: 'reference_only' }))
          ];
          ui.template.appearance.background.asset_id = data.background_pages?.[0]?.asset_id || null;
          ui.backgroundUrl = data.background_pages?.[0]?.url || null;
          ui.dirty = !ui.template.is_builtin;
          result.textContent += data.background_pages?.length
            ? `\nĐã tạo ${data.background_pages.length} ảnh trang nền. Gắn vùng điền bằng tọa độ trong thuộc tính slot.`
            : '\nTài liệu gốc đã lưu; chưa tạo được ảnh trang nền.';
          const sourceLink = node('a', `Tải tài liệu gốc: ${data.asset.original_name || 'DOCX/PDF'}`, 'template-download-link');
          sourceLink.href = data.asset.url; sourceLink.target = '_blank'; sourceLink.rel = 'noopener noreferrer';
          result.append(sourceLink);
          ui.importMessage = result.textContent;
          renderEditor();
          dialog.querySelector('.template-editor details:nth-of-type(2)')?.setAttribute('open', '');
        }
      } catch (err) { status(err.message, true); }
    }), result, suggestions, pagePreview);
  root.append(panel);
  loadAssets();
  drawPages();
}
async function cloneTemplate() {
  try {
    const source = ui.template;
    const template = structuredClone(source);
    template.template_id = `user.${crypto.randomUUID()}`;
    template.template_version = 1; template.origin = 'user'; template.is_builtin = false;
    template.derived_from = { template_id: source.template_id, template_version: source.template_version };
    template.display_name = `${source.display_name} (bản sao)`;
    const data = await api('/api/templates', { method: 'POST', body: JSON.stringify({ template }) });
    ui.template = data.template; ui.dirty = false; ui.selected = allSlots()[0]?.slot.slot_id || null;
    await loadGallery(); renderEditor(); status('Đã tạo bản sao tùy chỉnh.');
  } catch (err) { status(err.message, true); }
}
async function saveTemplate() {
  try {
    const t = ui.template;
    const data = await api(`/api/templates/${encodeURIComponent(t.template_id)}`, { method: 'PUT', body: JSON.stringify({ template: t, expected_version: t.template_version }) });
    ui.template = data.template; ui.dirty = false; await loadGallery(); renderEditor(); status('Đã lưu mẫu.');
  } catch (err) { status(err.message, true); }
}
async function deleteTemplate() {
  if (!confirm(`Xóa mẫu ${ui.template.display_name}?`)) return;
  try {
    await api(`/api/templates/${encodeURIComponent(ui.template.template_id)}`, { method: 'DELETE' });
    ui.template = null; ui.dirty = false; await loadGallery(); renderEditor(); status('Đã xóa mẫu.');
  } catch (err) { status(err.message, true); }
}
function openInLegacy() {
  const t = ui.template;
  const missing = missingContent();
  if (missing.length) { status(`Còn ${missing.length} câu chưa có đề bài hoặc đủ lựa chọn. Hãy dán kết quả AI hay điền nội dung trước khi mở trình soạn đề.`, true); return; }
  const badKey = allSlots().filter(({ slot }) => slot.question_type === 'MCQ' &&
    !syncCorrectOption(structuredClone(slot.content)).options.some(option => option.is_correct));
  if (badKey.length) { status(`Còn ${badKey.length} câu trắc nghiệm có đáp án không trùng A/B/C/D của lựa chọn. Sửa đáp án trước khi mở trình soạn đề.`, true); return; }
  const blocks = templateToBlocks(t);
  window.dispatchEvent(new CustomEvent('exambuilder:open-template', { detail: {
    blocks, title: t.defaults.exam_title || t.display_name, subject: t.defaults?.subject || '', duration_minutes: t.defaults?.duration_minutes || null,
    school_header: t.defaults?.school_header || '', template_id: t.template_id, template_version: t.template_version,
    template_binding: templateBinding(t)
  } }));
  dialog.close();
}
function missingContent() {
  return allSlots().filter(({ slot }) => !slot.content?.content?.trim() ||
    (slot.question_type === 'MCQ' && (!Array.isArray(slot.content?.options) || slot.content.options.length < 4)));
}
const exportInput = mode => templateExportInput(ui.template, mode);
// In theo bo cuc mau (A4/A5, hai cot, vung tra loi). Tai Word theo mau nam o nut
// "Xuat Word" cua man hinh chinh khi de dang mo duoc tao tu mau.
function renderExportPanel(root) {
  const panel = node('section', null, 'template-prompts');
  panel.append(node('h4', 'In theo mẫu'));
  const mode = select('Bản in', 'student', [['student','Học sinh'],['teacher','Giáo viên'],['answer_key','Đáp án riêng'],['combined','Đề và đáp án cuối file']], () => {});
  const warnings = node('pre', '', 'template-report');
  const analyze = async () => {
    const data = await api('/api/template-export/analyze', { method: 'POST', body: JSON.stringify(exportInput(mode.querySelector('select').value)) });
    warnings.textContent = `Ước lượng ${data.estimatedPages} trang.\n${data.warnings.map(w => w.message).join('\n')}`;
    return data;
  };
  panel.append(mode, button('In / Lưu PDF', async () => {
    if (missingContent().length) { status('Cần điền đủ đề bài và lựa chọn trước khi in.', true); return; }
    try {
      const check = await analyze();
      if (check.warnings.some(w => w.code === 'MAX_PAGES_ESTIMATE') &&
          !confirm(`Ước lượng ${check.estimatedPages} trang, vượt giới hạn. Vẫn in?`)) return;
    } catch (err) { status(err.message, true); return; }
    ui.previewMode = mode.querySelector('select').value;
    renderEditor();
    const paper = ui.template.appearance;
    let pageStyle = document.getElementById('templatePageStyle');
    if (!pageStyle) { pageStyle = node('style'); pageStyle.id = 'templatePageStyle'; document.head.append(pageStyle); }
    const margins = paper.margins_mm;
    pageStyle.textContent = `@page { size: ${paper.paper} ${paper.orientation}; margin: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm; }`;
    // Chi luc in tu cua so Mau de moi an trang chinh (xem templateSystem.css).
    document.body.classList.add('template-printing');
    window.addEventListener('afterprint', () => {
      document.body.classList.remove('template-printing');
      pageStyle.textContent = '';
    }, { once: true });
    window.print();
  }), node('p', 'Tải Word theo mẫu: bấm "Mở trong trình soạn đề" rồi dùng nút "Xuất Word" ở trang chính.', 'hint'), warnings);
  root.append(panel);
}
function renderPromptPanel(root) {
  const panel = node('section', null, 'template-prompts');
  panel.append(node('h4', 'Prompt cho AI ngoài'));
  const group = select('Nhóm prompt', ui.promptGroup || 'FULL_EXAM', Object.entries(groups), value => { ui.promptGroup = value; ui.draft = null; refreshPrompt(); });
  const variant = select('AI', ui.aiVariant || 'ChatGPT', variants.map(v => [v, v]), value => { ui.aiVariant = value; ui.draft = null; refreshPrompt(); });
  const action = select('Hành động P3', ui.repairIntent || 'rewrite-one', [['rewrite-one','Sửa câu chọn'],['regenerate','Sinh lại câu chọn'],['increase-difficulty','Tăng độ khó một mức'],['decrease-difficulty','Giảm độ khó một mức'],['improve-solution','Cải thiện lời giải (giữ đáp án)'],['restyle-keep-answer','Đổi cách diễn đạt (giữ đáp án)'],['validate-only','Chỉ kiểm tra (báo cáo JSON)']], value => { ui.repairIntent = value; ui.draft = null; refreshPrompt(); });
  const instructions = field('Yêu cầu thêm của giáo viên', ui.template.prompt_settings?.extra_instructions || '', value => {
    ui.template.prompt_settings ||= {}; ui.template.prompt_settings.extra_instructions = value;
    ui.dirty = !ui.template.is_builtin; refreshPrompt();
  }, 'textarea');
  const preview = node('textarea'); preview.readOnly = true; preview.rows = 10; preview.setAttribute('aria-label', 'Nội dung prompt');
  async function refreshPrompt() {
    try {
      const data = await api('/api/template-prompts/build', { method: 'POST', body: JSON.stringify({ template: ui.template,
        promptGroup: group.querySelector('select').value, aiVariant: variant.querySelector('select').value,
        selectedSlotIds: ui.promptSelection?.size ? [...ui.promptSelection] : ui.selected ? [ui.selected] : [],
        teacherExtraInstructions: instructions.querySelector('textarea').value, repairIntent: action.querySelector('select').value,
        currentContent: Object.fromEntries(allSlots().filter(({ slot }) => slot.content).map(({ slot }) => [slot.slot_id, slot.content])) }) });
      preview.value = data.prompt || '';
    } catch (err) { preview.value = ''; status(err.message, true); }
  }
  panel.append(group, variant, action, instructions,
    button('Tạo prompt', async () => { await refreshPrompt(); toast(preview.value ? 'Đã tạo prompt từ cấu trúc hiện tại.' : 'Chưa tạo được prompt — kiểm tra thông báo lỗi.', !preview.value); }), button('Copy Prompt', async () => {
      if (!preview.value) await refreshPrompt();
      try { await navigator.clipboard.writeText(preview.value); toast('Đã copy prompt — dán vào AI bạn chọn.'); }
      catch (err) { toast(`Không copy được: ${err.message}`, true); }
    }), preview);
  const pasted = node('textarea', null, 'template-pasted'); pasted.rows = 8; pasted.placeholder = 'Dán văn bản AI trả về';
  async function checkPasted() {
    try {
      if (group.querySelector('select').value === 'REVIEW_REPAIR' && action.querySelector('select').value === 'validate-only') {
        const selectedSlotIds = ui.promptSelection?.size ? [...ui.promptSelection] : [ui.selected];
        const review = await api('/api/template-prompts/review-report', { method: 'POST', body: JSON.stringify({ rawText: pasted.value, selectedSlotIds }) });
        ui.draft = null; report.textContent = JSON.stringify(review.report, null, 2);
        status('Đã đọc báo cáo kiểm tra. Không có nội dung câu nào được thay đổi.'); return;
      }
      const data = await api('/api/template-prompts/prepare', { method: 'POST', body: JSON.stringify({ template: ui.template,
        rawText: pasted.value, selectedSlotIds: group.querySelector('select').value === 'FULL_EXAM' ? [] : ui.promptSelection?.size ? [...ui.promptSelection] : [ui.selected],
        promptGroup: group.querySelector('select').value, repairIntent: action.querySelector('select').value,
        currentContent: Object.fromEntries(allSlots().filter(({ slot }) => slot.content).map(({ slot }) => [slot.slot_id, slot.content])) }) });
      ui.draft = data.draft || null;
      report.textContent = ui.draft.issues.map(x => `${x.severity}: ${x.human_readable_message}`).join('\n') || 'Không có lỗi cấu trúc.';
      for (const assignment of ui.draft.assignments) report.textContent += `\n\n${assignment.slot_id}\nTrước: ${JSON.stringify(assignment.before)}\nSau: ${JSON.stringify(assignment.after)}`;
      status('Đã kiểm tra. Chỉ áp dụng khi bản nháp hợp lệ và được xác nhận.');
    } catch (err) { status(err.message, true); }
  }
  panel.append(node('p', 'Muốn AI sinh đề tự động qua API theo mẫu này: đóng hộp thoại, mở tab "Sinh đề tự động" và chọn mẫu ở ô "Khung đề".', 'hint'));
  panel.append(node('h4', 'Dán kết quả AI'), pasted, button('Kiểm tra và xem thay đổi', checkPasted), button('Áp dụng bản nháp', () => {
    if (!ui.draft?.valid) { status('Bản nháp chưa hợp lệ, chưa thể áp dụng.', true); return; }
    if (!confirm(`Áp dụng ${ui.draft.assignments.length} câu đã xem?`)) return;
    ui.undo = ui.draft.assignments.map(a => { const slot = allSlots().find(x => x.slot.slot_id === a.slot_id)?.slot; return { slot_id: a.slot_id, before: structuredClone(slot?.content ?? null), level: slot?.difficulty_level }; });
    ui.draft.assignments.forEach(a => {
      const slot = allSlots().find(x => x.slot.slot_id === a.slot_id)?.slot;
      if (!slot) return;
      slot.content = structuredClone(a.after);
      // Muc do theo yeu cau giao vien (AI tra) thay muc mac dinh cua slot.
      if (a.after?.difficulty_level) slot.difficulty_level = a.after.difficulty_level;
    });
    ui.draft = null; ui.dirty = !ui.template.is_builtin; renderEditor(); status('Đã áp dụng. Có thể hoàn tác trước khi đóng.');
  }), button('Hoàn tác lần áp dụng', () => {
    if (!ui.undo) return;
    ui.undo.forEach(a => { const slot = allSlots().find(x => x.slot.slot_id === a.slot_id)?.slot; if (slot) { slot.content = a.before; if (a.level) slot.difficulty_level = a.level; } });
    ui.undo = null; renderEditor(); status('Đã hoàn tác.');
  }), button('Hủy bản nháp', () => {
    ui.draft = null; report.textContent = ''; status('Đã hủy bản nháp. Nội dung hiện có giữ nguyên.');
  }));
  const report = node('pre', '', 'template-report'); panel.append(report);
  root.append(panel);
  ui.refreshPrompt = refreshPrompt;
  refreshPrompt();
  renderExportPanel(root);
}
launchButton?.addEventListener('click', () => { renderShell(); dialog.showModal(); loadGallery(); });
