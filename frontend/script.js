import { TextPromptParser } from '/parser/TextPromptParser.js';
import { FileUploadParser } from '/parser/FileUploadParser.js';
import { formatMathSymbols, latexToPlainText } from '/parser/mathFormat.js';
import { generateExamCodes, shuffleAllMCQOptions } from '/parser/examCodeGenerator.js';
import { redactExamForStudent } from '/parser/examRedaction.js';
import { AI_PROMPT_VARIANTS } from './promptVariants.js';
import { createAutoPull } from './autoPull.js';
import { createArchiveOutbox } from './archiveOutbox.js';
import { VARIANT_BY_PROVIDER, describeTemplate, templateToBlocks, templateBinding, fillTemplateFromBlocks, templateExportInput } from './examFrames.js';

// Ve noi dung toan hoc: MOI cau truc 2 chieu (can, phan so, can bac n, he
// phuong trinh, tich phan...) deu duoc quy ve $...$ / $$...$$ LaTeX roi giao
// het cho KaTeX ve. KHONG con renderer "can/phan so gia bang CSS" - phan
// ngoai $...$ chi con la van xuoi + ky hieu 1 hang Unicode (x², ≤, π, °).
// formatMathSymbols chay tai cho: quy cau truc 2 chieu (promoteStructuralMath)
// + lam dep ky hieu 1 hang o vung ngoai $...$; idempotent nen noi dung da
// luu chay lai vo hai, noi dung dang go cung ve dep ngay.
const MATH_SPAN_RE = /\$\$[^$]+\$\$|\$[^$]+\$/g;

function renderMathInline(container, text) {
  container.innerHTML = '';
  if (typeof text !== 'string' || !text) return;
  text = formatMathSymbols(text);

  let lastIndex = 0;
  let match;
  MATH_SPAN_RE.lastIndex = 0;
  while ((match = MATH_SPAN_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    const block = match[0].startsWith('$$');
    renderKatexSpan(container, match[0].slice(block ? 2 : 1, block ? -2 : -1), block);
    lastIndex = MATH_SPAN_RE.lastIndex;
  }
  if (lastIndex < text.length) {
    container.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

// innerHTML o day AN TOAN: noi dung la HTML do CHINH KaTeX sinh ra tu cu
// phap LaTeX (khong phai chuoi AI/nguoi dung duoc chen thang vao DOM). Voi
// trust:false + throwOnError:false, KaTeX tu ve node loi (mau do) va vo hieu
// hoa cac lenh sinh HTML/URL tuy y (\href, \includegraphics) - co che an
// toan chinh thuc cho render LaTeX khong tin cay (public-facing). Fallback
// (KaTeX chua tai xong / loi hi huu) = text da lam phang, KHONG dung CSS.
function renderKatexSpan(container, latex, displayMode = false) {
  const span = document.createElement('span');
  if (window.katex) {
    try {
      span.innerHTML = window.katex.renderToString(latex, {
        throwOnError: false, trust: false, strict: false, displayMode
      });
    } catch (e) {
      span.textContent = latexToPlainText(latex);
    }
  } else {
    span.textContent = latexToPlainText(latex);
  }
  container.appendChild(span);
}

const DIFFICULTY_LABEL = { NB: 'Nhận biết', TH: 'Thông hiểu', VD: 'Vận dụng', VDC: 'Vận dụng cao' };
const TYPE_LABEL = { MCQ: 'Trắc nghiệm', FILL_BLANK: 'Điền từ', TRUE_FALSE: 'Đúng/Sai', ESSAY: 'Tự luận' };

const state = {
  examId: null,
  archiveId: null, // exam_id trong kho de (SAVED_EXAM) - tach voi examId (bang EXAM cho link chia se)
  title: '',
  subject: '',
  duration_minutes: null,
  school_header: '',
  blocks: [],
  isStudentMode: false,
  zoom: 1,
  activeShareCode: null,
  examVersions: [],
  activeVersionIndex: -1,
  background: { enabled: false, file: '', opacity: 0.3, fit: 'cover' },
  examBackground: null, // nen da gan va luu cung de dang mo ({ file, opacity, fit } | null)
  template_binding: null
};

const versionContainers = new Map(); // code -> { el, blocks }

let formQuestions = [];
let formEditingIndex = null;
let lastGenerateSaveAt = 0; // thoi diem luu kho gan nhat tu nut "Sinh De" (xem applyGeneratedBlocks)

const examContainerEl = document.getElementById('examContainer');
const errorMessageEl = document.getElementById('errorMessage');

// ---------- Tabs ----------
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    hideError(); // loi cua tab truoc khong lien quan tab moi
    // Tab "auto" co nut sinh de rieng (autoGenerateBtn) vi thao tac bat dong
    // bo (goi LLM) khac han cac tab con lai - an nut "Sinh De Kiem Tra" chung
    // de tranh nham lan khi dang o tab nay.
    document.getElementById('generateBtn').classList.toggle('form-hidden', btn.dataset.tab === 'auto');
  });
});

// ---------- Nen PDF (background overlay khi in) ----------
const examPrintBgEl = document.getElementById('examPrintBg');
const bgEnableToggle = document.getElementById('bgEnableToggle');
const bgSelect = document.getElementById('bgSelect');
const bgOpacityRange = document.getElementById('bgOpacityRange');
const bgOpacityValue = document.getElementById('bgOpacityValue');

function applyBackgroundToPrintLayer() {
  const { enabled, file, opacity } = state.background;
  const active = enabled && !!file;
  examPrintBgEl.classList.toggle('enabled', active);
  if (active) {
    examPrintBgEl.style.backgroundImage = `url("/backgrounds/${encodeURIComponent(file)}")`;
    examPrintBgEl.style.opacity = String(opacity);
    // Tam anh luon trung tam to giay (background-position: center trong CSS in).
    examPrintBgEl.style.backgroundSize = state.background.fit === 'contain' ? 'contain' : 'cover';
  } else {
    examPrintBgEl.style.backgroundImage = '';
  }
  // Hien nen ngay tren ban xem truoc (truoc day chi hien khi in).
  examContainerEl.classList.toggle('has-screen-bg', active);
  examContainerEl.style.setProperty('--exam-bg', active ? `url("/backgrounds/${encodeURIComponent(file)}")` : 'none');
  examContainerEl.style.setProperty('--exam-bg-opacity', String(opacity));
}

// Dua dieu khien "Nen PDF" ve dung state.background (khi mo de da gan nen).
function syncBackgroundControls() {
  const { enabled, file, opacity, fit } = state.background;
  bgEnableToggle.checked = enabled;
  if (file && ![...bgSelect.options].some(o => o.value === file)) bgSelect.append(new Option(file, file));
  bgSelect.value = file || '';
  bgOpacityRange.value = String(Math.round(opacity * 100));
  bgOpacityValue.textContent = `${Math.round(opacity * 100)}%`;
  bgFitSelect.value = fit === 'contain' ? 'contain' : 'cover';
  bgSelect.disabled = bgOpacityRange.disabled = bgFitSelect.disabled = !enabled;
  bgPreviewBtn.disabled = !enabled || !file;
  applyBackgroundToPrintLayer();
}

function updateExamBackgroundStatus() {
  const el = document.getElementById('bgExamStatus');
  document.getElementById('bgApplyToExamBtn').disabled = !state.blocks.length;
  if (!state.blocks.length) { el.textContent = ''; return; }
  const bg = state.examBackground;
  const name = bg && ([...bgSelect.options].find(o => o.value === bg.file)?.textContent || bg.file);
  el.textContent = bg ? `Đề đang mở đã gắn nền: ${name} (${Math.round(bg.opacity * 100)}%).` : 'Đề đang mở chưa gắn nền.';
}

// Mo de: nen da luu cung de duoc bat lai; de khong gan nen -> tat nen de
// man hinh hien dung nhu de da luu.
function restoreExamBackground(background) {
  state.examBackground = background && background.file ? { file: background.file, opacity: Number(background.opacity) || 0.3, fit: background.fit === 'contain' ? 'contain' : 'cover' } : null;
  state.background = state.examBackground ? { enabled: true, ...state.examBackground } : { ...state.background, enabled: false };
  syncBackgroundControls();
  updateExamBackgroundStatus();
}

// Danh sach anh trong resources/backgrounds. Anh tai len luu ten theo SHA-256
// (image-<hash>.png) nen lay ten goc tu metadata /api/backgrounds/assets de hien thi.
async function loadBackgroundList(selectFile) {
  try {
    const res = await fetch('/api/backgrounds');
    const files = res.ok ? await res.json() : [];
    const names = new Map();
    try {
      const assets = await (await fetch('/api/backgrounds/assets')).json();
      for (const a of assets.assets || []) if (a.filename) names.set(a.filename, a.original_name || a.filename);
    } catch { /* khong co metadata: hien ten file */ }
    const blank = new Option('— Chọn ảnh nền —', '');
    const options = files.map(f => new Option(names.get(f) || f, f))
      .sort((x, y) => x.text.localeCompare(y.text, 'vi', { numeric: true }));
    bgSelect.replaceChildren(blank, ...options);
    if (selectFile && files.includes(selectFile)) state.background.file = selectFile;
    else if (files.length && !files.includes(state.background.file)) state.background.file = files[0];
    bgSelect.value = state.background.file || '';
  } catch {
    // Khong co nen PDF nao kha dung - giu dropdown rong, khong chan luong chinh.
  }
}
loadBackgroundList();

// Tai anh nen moi: anh -> /api/backgrounds/upload; PDF/Word -> moi trang thanh
// mot anh (/api/backgrounds/import, mode=background) va chon trang 1.
const bgUploadInput = document.getElementById('bgUploadInput');
document.getElementById('bgUploadBtn').addEventListener('click', () => bgUploadInput.click());
bgUploadInput.addEventListener('change', async () => {
  const file = bgUploadInput.files[0];
  if (!file) return;
  hideError();
  const isDocument = /\.(pdf|docx)$/i.test(file.name);
  const form = new FormData();
  form.append('file', file);
  if (isDocument) form.append('mode', 'background');
  const btn = document.getElementById('bgUploadBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Đang tải...';
  try {
    const res = await fetch(isDocument ? '/api/backgrounds/import' : '/api/backgrounds/upload', { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.error || `HTTP ${res.status}`);
    let filename;
    if (isDocument) {
      const pages = data.background_pages || [];
      if (!pages.length) throw new Error((data.warnings || []).join(' ') || 'Không tạo được ảnh trang từ tài liệu.');
      filename = decodeURIComponent(pages[0].url.split('/').pop());
      showCopyToast(`✅ Đã thêm ${pages.length} ảnh nền từ "${file.name}" (đang chọn trang 1).`, 5000);
    } else {
      filename = data.asset.filename;
      showCopyToast(`✅ Đã thêm ảnh nền "${file.name}".`, 5000);
    }
    await loadBackgroundList(filename);
    bgEnableToggle.checked = true;
    bgEnableToggle.dispatchEvent(new Event('change'));
  } catch (err) {
    showError('Lỗi tải ảnh nền: ' + err.message);
  } finally {
    // Chi xoa o chon file SAU khi gui: trinh duyet doc file luc fetch, xoa som se 'Failed to fetch'.
    bgUploadInput.value = '';
    btn.disabled = false;
    btn.textContent = '⬆️ Tải ảnh nền';
  }
});

bgEnableToggle.addEventListener('change', () => {
  state.background.enabled = bgEnableToggle.checked;
  bgSelect.disabled = !bgEnableToggle.checked;
  bgOpacityRange.disabled = !bgEnableToggle.checked;
  bgFitSelect.disabled = !bgEnableToggle.checked;
  bgPreviewBtn.disabled = !bgEnableToggle.checked || !state.background.file;
  applyBackgroundToPrintLayer();
});
bgSelect.addEventListener('change', () => {
  state.background.file = bgSelect.value;
  bgPreviewBtn.disabled = !bgEnableToggle.checked || !state.background.file;
  applyBackgroundToPrintLayer();
});

// Xem truoc nen tren to A4 (man hinh khong hien lop nen in) + cach dat anh.
// Khong dung AI: tam anh trung tam to giay, phu kin (cat quanh tam) hoac giu ca anh.
const bgFitSelect = document.getElementById('bgFitSelect');
const bgPreviewBtn = document.getElementById('bgPreviewBtn');
const bgPreviewDialog = document.getElementById('bgPreviewDialog');
const A4_RATIO = 210 / 297;
bgFitSelect.addEventListener('change', () => {
  state.background.fit = bgFitSelect.value;
  applyBackgroundToPrintLayer();
  if (bgPreviewDialog.open) renderBackgroundPreview();
});
function describeFit(width, height, fit) {
  const ratio = width / height;
  if (Math.abs(ratio - A4_RATIO) < 0.01) return 'Ảnh đúng tỉ lệ A4: phủ kín, không bị cắt.';
  const wider = ratio > A4_RATIO;
  // Cung mot ty le cho ca hai che do: anh ngang hon A4 -> cover cat chieu ngang
  // anh, contain de trong chieu doc trang, deu theo phan so A4/ratio (va nguoc lai).
  const lost = Math.round((1 - (wider ? A4_RATIO / ratio : ratio / A4_RATIO)) * 100);
  if (fit === 'cover') {
    return `Phủ kín trang: cắt khoảng ${lost}% ${wider ? 'chiều ngang ảnh (chia đều trái/phải)' : 'chiều dọc ảnh (chia đều trên/dưới)'}, tâm ảnh trùng tâm trang.`;
  }
  return `Giữ nguyên cả ảnh: trống khoảng ${lost}% ${wider ? 'chiều dọc trang (chia đều trên/dưới)' : 'chiều ngang trang (chia đều trái/phải)'}, ảnh đặt giữa trang.`;
}
function renderBackgroundPreview() {
  const { file, opacity, fit } = state.background;
  const imageEl = document.getElementById('bgPreviewImage');
  const url = `/backgrounds/${encodeURIComponent(file)}`;
  imageEl.style.backgroundImage = `url("${url}")`;
  imageEl.style.backgroundSize = fit === 'contain' ? 'contain' : 'cover';
  imageEl.style.opacity = String(opacity);
  const info = document.getElementById('bgPreviewInfo');
  const probe = new Image();
  probe.onload = () => {
    info.textContent = `${bgSelect.selectedOptions[0]?.textContent || file} · ${probe.naturalWidth}×${probe.naturalHeight} px · độ mờ ${Math.round(opacity * 100)}%. ${describeFit(probe.naturalWidth, probe.naturalHeight, fit)} Khi in, bật "Hình nền / Background graphics" trong hộp thoại in.`;
  };
  probe.onerror = () => { info.textContent = 'Không đọc được ảnh nền này.'; };
  probe.src = url;
}
bgPreviewBtn.addEventListener('click', () => {
  if (!state.background.file) return;
  renderBackgroundPreview();
  bgPreviewDialog.showModal();
});
document.getElementById('bgPreviewCloseBtn').addEventListener('click', () => bgPreviewDialog.close());
bgOpacityRange.addEventListener('input', () => {
  const pct = parseInt(bgOpacityRange.value, 10);
  state.background.opacity = pct / 100;
  bgOpacityValue.textContent = `${pct}%`;
  applyBackgroundToPrintLayer();
  if (bgPreviewDialog.open) renderBackgroundPreview();
});

// ---------- Prompt reference section (Task 2 + bien the theo tung AI) ----------
// AI_PROMPT_VARIANTS (frontend/promptVariants.js, tu dong sinh tu AI_Prompts_Variants.txt):
// moi AI (Gemini/Gemini Pro/ChatGPT/DeepSeek/Claude/Grok) mot prompt rieng, dung chung quy tac dinh dang
// (nguon that su van la Gemini_Prompt_Unified.txt) nhung khac nhau o luu y rieng + vi du mon hoc.
const promptPlatformTabsEl = document.getElementById('promptPlatformTabs');
const promptPlatformHintEl = document.getElementById('promptPlatformHint');
const promptTextEl = document.getElementById('promptText');
const promptExampleTextEl = document.getElementById('promptExampleText');
const promptExampleHintEl = document.getElementById('promptExampleHint');

let activePromptVariant = AI_PROMPT_VARIANTS[0];

function renderActivePromptVariant() {
  promptPlatformHintEl.textContent = activePromptVariant.hint;
  promptTextEl.textContent = activePromptVariant.template;
  promptExampleTextEl.textContent = activePromptVariant.example;
  promptExampleHintEl.textContent =
    `Ví dụ chủ đề "${activePromptVariant.exampleTopic}" — có thể copy và dán thẳng vào tab "Dán văn bản" rồi bấm "Sinh Đề Kiểm Tra" để xem thử.`;
}

AI_PROMPT_VARIANTS.forEach((variant, i) => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'platform-tab-btn' + (i === 0 ? ' active' : '');
  btn.textContent = variant.label;
  btn.addEventListener('click', () => {
    activePromptVariant = variant;
    promptPlatformTabsEl.querySelectorAll('.platform-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderActivePromptVariant();
  });
  promptPlatformTabsEl.appendChild(btn);
});
renderActivePromptVariant();

let copyToastTimer = null;
function showCopyToast(msg, durationMs = 2000) {
  const toast = document.getElementById('copyToast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(copyToastTimer);
  copyToastTimer = setTimeout(() => toast.classList.remove('show'), durationMs);
}

async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const helper = document.createElement('textarea');
    helper.value = text;
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(helper);
    return ok;
  }
}

document.getElementById('copyPromptBtn').addEventListener('click', async () => {
  const ok = await copyTextToClipboard(activePromptVariant.template);
  showCopyToast(ok ? `✅ Đã sao chép prompt (${activePromptVariant.label}) vào clipboard!` : '❌ Không thể sao chép, hãy copy thủ công.');
});
document.getElementById('copyExampleBtn').addEventListener('click', async () => {
  const ok = await copyTextToClipboard(activePromptVariant.example);
  showCopyToast(ok ? `✅ Đã sao chép ví dụ (${activePromptVariant.label}) vào clipboard!` : '❌ Không thể sao chép, hãy copy thủ công.');
});

// ---------- Form tab ----------
const formQuestionType = document.getElementById('formQuestionType');
const formOptionsMCQ = document.getElementById('formOptionsMCQ');
const formFillBlankAnswer = document.getElementById('formFillBlankAnswer');
const formTrueFalseAnswer = document.getElementById('formTrueFalseAnswer');
const formDraftLines = document.getElementById('formDraftLines');

function updateFormFieldsVisibility() {
  const type = formQuestionType.value;
  formOptionsMCQ.classList.toggle('form-hidden', type !== 'MCQ');
  formFillBlankAnswer.classList.toggle('form-hidden', type !== 'FILL_BLANK');
  formTrueFalseAnswer.classList.toggle('form-hidden', type !== 'TRUE_FALSE');
  formDraftLines.classList.toggle('form-hidden', type !== 'ESSAY');
}
formQuestionType.addEventListener('change', updateFormFieldsVisibility);
updateFormFieldsVisibility();

const addFormQuestionBtn = document.getElementById('addFormQuestionBtn');
const cancelEditFormBtn = document.getElementById('cancelEditFormBtn');

addFormQuestionBtn.addEventListener('click', () => {
  const type = formQuestionType.value;
  const content = document.getElementById('formContent').value.trim();
  const difficulty = document.getElementById('formDifficulty').value;
  const explanation = document.getElementById('formExplanation').value.trim();

  if (!content) { showError('Vui lòng nhập nội dung đề bài.'); return; }

  const isEditing = formEditingIndex !== null;
  const q = {
    id: isEditing ? formQuestions[formEditingIndex].id : crypto.randomUUID(),
    question_type: type,
    content: formatMathSymbols(content),
    difficulty_level: difficulty,
    explanation: formatMathSymbols(explanation) || null,
    correct_answer: null,
    options: [],
    draft_lines_count: 0
  };

  if (type === 'MCQ') {
    const rows = document.querySelectorAll('#formOptionsMCQ .form-option-row');
    const options = [];
    rows.forEach(row => {
      const input = row.querySelector('.form-option-text');
      const text = input.value.trim();
      if (text) options.push({ option_key: input.dataset.key, option_text: formatMathSymbols(text), is_correct: false });
    });
    if (options.length < 2) { showError('Câu trắc nghiệm cần ít nhất 2 lựa chọn.'); return; }
    const correctKey = document.querySelector('input[name="formCorrectOption"]:checked').value;
    if (!options.some(o => o.option_key === correctKey)) {
      showError('Đáp án đúng phải khớp với 1 lựa chọn đã nhập nội dung.');
      return;
    }
    options.forEach(o => { o.is_correct = o.option_key === correctKey; });
    q.options = options;
    q.correct_answer = correctKey;
  } else if (type === 'FILL_BLANK') {
    const ans = formFillBlankAnswer.value.trim();
    if (!ans) { showError('Vui lòng nhập đáp án đúng.'); return; }
    q.correct_answer = formatMathSymbols(ans);
  } else if (type === 'TRUE_FALSE') {
    q.correct_answer = formTrueFalseAnswer.value;
  } else if (type === 'ESSAY') {
    q.draft_lines_count = Math.max(1, parseInt(formDraftLines.value, 10) || 5);
  }

  if (isEditing) {
    formQuestions[formEditingIndex] = q;
  } else {
    formQuestions.push(q);
  }
  exitEditMode();
  renderFormQuestionList();
  clearFormFields();
  hideError();
});

cancelEditFormBtn.addEventListener('click', () => {
  exitEditMode();
  clearFormFields();
  hideError();
});

function exitEditMode() {
  formEditingIndex = null;
  addFormQuestionBtn.textContent = '+ Thêm câu hỏi vào danh sách';
  cancelEditFormBtn.classList.add('form-hidden');
}

function loadQuestionIntoForm(index) {
  const q = formQuestions[index];
  formEditingIndex = index;

  formQuestionType.value = q.question_type;
  updateFormFieldsVisibility();
  document.getElementById('formDifficulty').value = q.difficulty_level;
  document.getElementById('formContent').value = q.content;
  document.getElementById('formExplanation').value = q.explanation || '';

  document.querySelectorAll('#formOptionsMCQ .form-option-text').forEach(i => { i.value = ''; });
  document.querySelector('input[name="formCorrectOption"][value="A"]').checked = true;
  if (q.question_type === 'MCQ') {
    q.options.forEach(o => {
      const input = document.querySelector(`#formOptionsMCQ .form-option-text[data-key="${o.option_key}"]`);
      if (input) input.value = o.option_text;
    });
    const radio = document.querySelector(`input[name="formCorrectOption"][value="${q.correct_answer}"]`);
    if (radio) radio.checked = true;
  } else if (q.question_type === 'FILL_BLANK') {
    formFillBlankAnswer.value = q.correct_answer || '';
  } else if (q.question_type === 'TRUE_FALSE') {
    formTrueFalseAnswer.value = q.correct_answer || 'Dung';
  } else if (q.question_type === 'ESSAY') {
    formDraftLines.value = q.draft_lines_count || 5;
  }

  addFormQuestionBtn.textContent = 'Cập nhật câu hỏi';
  cancelEditFormBtn.classList.remove('form-hidden');
  document.querySelector('.tab-btn[data-tab="form"]').scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function renderFormQuestionList() {
  const list = document.getElementById('formQuestionList');
  list.innerHTML = '';
  formQuestions.forEach((q, i) => {
    const li = document.createElement('li');
    li.className = 'form-question-item';

    const info = document.createElement('div');
    info.className = 'form-question-item-info';
    const preview = q.content.length > 60 ? q.content.slice(0, 60) + '…' : q.content;
    info.innerHTML = `<strong>Câu ${i + 1} · ${TYPE_LABEL[q.question_type]} · ${DIFFICULTY_LABEL[q.difficulty_level]}</strong><span>${escapeHtml(preview)}</span>`;

    const actions = document.createElement('div');
    actions.className = 'form-question-item-actions';
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'edit-btn';
    editBtn.textContent = 'Sửa';
    editBtn.addEventListener('click', () => loadQuestionIntoForm(i));
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'delete-btn';
    delBtn.textContent = 'Xóa';
    delBtn.addEventListener('click', () => {
      formQuestions.splice(i, 1);
      if (formEditingIndex === i) { exitEditMode(); clearFormFields(); }
      else if (formEditingIndex !== null && i < formEditingIndex) { formEditingIndex -= 1; }
      renderFormQuestionList();
    });
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    li.appendChild(info);
    li.appendChild(actions);
    list.appendChild(li);
  });
}

function clearFormFields() {
  document.getElementById('formContent').value = '';
  document.getElementById('formExplanation').value = '';
  document.querySelectorAll('#formOptionsMCQ .form-option-text').forEach(i => { i.value = ''; });
  document.querySelector('input[name="formCorrectOption"][value="A"]').checked = true;
  formFillBlankAnswer.value = '';
  formTrueFalseAnswer.value = 'Dung';
  formDraftLines.value = '5';
}

// ---------- Tai file PDF / file sai dinh dang ----------
// PDF co lop chu: trich chu o server roi parse nhu .txt. PDF scan hoac file
// sai cau truc: khong co OCR (cau 34) -> goi y gui file cho AI ngoai kem prompt
// chuyen doi, AI tra ve van ban dung dinh dang de dan vao tab "Dan van ban".
let convertPromptText = '';
function hideConvertPrompt() { document.getElementById('convertPromptBox').classList.add('form-hidden'); }
function showConvertPrompt(hint, sourceText) {
  const source = sourceText ? 'nội dung bên dưới' : 'tệp PDF/ảnh tôi đính kèm';
  convertPromptText = [
    activePromptVariant.template,
    '━━━━━━━━ YÊU CẦU CHUYỂN ĐỔI ━━━━━━━━',
    `KHÔNG tự sáng tác câu hỏi mới. Hãy chép lại ĐÚNG các câu hỏi có trong ${source} (giữ nguyên đề bài, lựa chọn, đáp án nếu có) và trình bày lại theo đúng định dạng ở trên. Câu nào không có đáp án/lời giải thì tự giải và ghi rõ. Công thức toán viết bằng $...$.`,
    ...(sourceText ? [`NỘI DUNG GỐC:\n${sourceText.slice(0, 200000)}`] : [])
  ].join('\n\n');
  document.getElementById('convertPromptHint').textContent = hint;
  document.getElementById('convertPromptBox').classList.remove('form-hidden');
}
document.getElementById('copyConvertPromptBtn').addEventListener('click', async () => {
  const ok = await copyTextToClipboard(convertPromptText);
  showCopyToast(ok ? '✅ Đã sao chép prompt chuyển đổi. Dán vào ChatGPT/Gemini/Claude (đính kèm file nếu là PDF scan), rồi dán kết quả vào tab "Dán văn bản".' : '❌ Không thể sao chép, hãy copy thủ công.');
});
async function parseUploadWithConvertHint(file) {
  try {
    return await new FileUploadParser().parseFile(file);
  } catch (err) {
    if (/\.(docx|txt)$/i.test(file.name)) {
      const text = /\.txt$/i.test(file.name) ? await file.text() : null;
      showConvertPrompt('Tệp chưa theo đúng cấu trúc của ExamBuilder. Bấm nút dưới để copy prompt, gửi cho AI ngoài cùng tệp này để chuyển định dạng.', text);
    }
    throw err;
  }
}
async function parsePdfUpload(file) {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch('/api/resources/extract-pdf-text', { method: 'POST', body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || `Không đọc được PDF (HTTP ${response.status})`);
  if (data.scanned) {
    showConvertPrompt(`"${file.name}" là PDF scan (${data.pages || '?'} trang ảnh, không có lớp chữ) nên phần mềm không đọc được chữ — phiên bản này không có OCR. Cách làm: copy prompt dưới, gửi cho ChatGPT/Gemini/Claude KÈM tệp PDF (nên chia nhỏ vài trang mỗi lần), rồi dán kết quả vào tab "Dán văn bản".`, null);
    showError('PDF scan: không có chữ để đọc. Xem hướng dẫn bên dưới nút chọn tệp.');
    return null;
  }
  try {
    return new TextPromptParser().parse(data.text);
  } catch (err) {
    showConvertPrompt('Đã đọc được chữ trong PDF nhưng chưa theo đúng cấu trúc ExamBuilder. Bấm nút dưới để copy prompt (đã kèm nội dung PDF), gửi cho AI ngoài để chuyển định dạng.', data.text);
    throw err;
  }
}

// ---------- Generate exam ----------
document.getElementById('generateBtn').addEventListener('click', async () => {
  hideError();
  const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
  try {
    let blocks;
    if (activeTab === 'text') {
      const raw = document.getElementById('rawTextInput').value;
      blocks = new TextPromptParser().parse(raw);
    } else if (activeTab === 'upload') {
      const fileInput = document.getElementById('fileInput');
      const file = fileInput.files[0];
      if (!file) { showError('Vui lòng chọn 1 tệp để tải lên.'); return; }
      hideConvertPrompt();
      blocks = /\.pdf$/i.test(file.name) ? await parsePdfUpload(file) : await parseUploadWithConvertHint(file);
      if (!blocks) return;
    } else {
      if (!formQuestions.length) {
        showError('Chưa có câu hỏi nào trong danh sách. Hãy thêm câu hỏi trước.');
        return;
      }
      const essayQs = formQuestions.filter(q => q.question_type === 'ESSAY');
      const otherQs = formQuestions.filter(q => q.question_type !== 'ESSAY');
      blocks = [];
      if (otherQs.length) blocks.push({ block_type: 'MULTIPLE_CHOICE', block_title: 'Phần I. Trắc nghiệm', questions: otherQs });
      if (essayQs.length) blocks.push({ block_type: 'ESSAY', block_title: 'Phần II. Tự luận', questions: essayQs });
    }

    applyGeneratedBlocks(blocks);
  } catch (err) {
    showError(err.message);
  }
});

// Dung chung cho ca 4 tab (text/upload/form/auto): gan blocks da parse/sinh
// ra vao state va ve lai Preview - tach rieng de tab "auto" (sinh qua LLM,
// bat dong bo) khong phai lap lai logic nay.
function applyGeneratedBlocks(blocks, { shuffle = true } = {}) {
  ensureIds(blocks);
  if (shuffle) shuffleAllMCQOptions(blocks);
  state.blocks = blocks;
  state.title = document.getElementById('examTitleInput').value.trim() || 'Đề kiểm tra';
  state.subject = document.getElementById('examSubjectInput').value.trim();
  state.duration_minutes = parseInt(document.getElementById('examDurationInput').value, 10) || null;
  state.school_header = document.getElementById('examSchoolInput').value.trim();
  state.examId = null;
  state.template_binding = null;
  state.examBackground = null;

  clearExamVersions();
  renderExam();
  toggleActionButtons(true);
  document.getElementById('generateMultiCodeBtn').disabled = false;

  // Bam "Sinh De" lai trong vong 30 giay -> coi la tinh chinh cung 1 de, cap
  // nhat ban ghi kho cu (khong tao dong moi). Sau 30 giay -> de moi.
  if (!state.archiveId || Date.now() - lastGenerateSaveAt > 30000) {
    state.archiveId = null;
  }
  lastGenerateSaveAt = Date.now();
  scheduleArchiveSave({ immediate: true });
}

// Template workspace hands off a completed snapshot to the existing editor.
window.addEventListener('exambuilder:open-template', event => {
  const detail = event.detail || {};
  if (!Array.isArray(detail.blocks)) return;
  document.getElementById('examTitleInput').value = detail.title || '';
  document.getElementById('examSubjectInput').value = detail.subject || '';
  document.getElementById('examDurationInput').value = detail.duration_minutes || '';
  document.getElementById('examSchoolInput').value = detail.school_header || '';
  state.archiveId = null;
  // De tu mau da duoc giao vien duyet: giu nguyen thu tu lua chon; muon xao
  // thi bam nut "Xao tron dap an".
  applyGeneratedBlocks(structuredClone(detail.blocks), { shuffle: false });
  state.template_binding = detail.template_binding || null;
  scheduleArchiveSave({ immediate: true });
});

function ensureIds(blocks) {
  blocks.forEach(b => {
    b.id = b.id || crypto.randomUUID();
    b.questions.forEach(q => { q.id = q.id || crypto.randomUUID(); });
  });
}

// TASK E: de cu (nap tu DB / dong bo Gist / link chia se) da bi ban cu cua
// formatMathSymbols lam phang "√80", "1/2"... -> quy lai ve $...$ LaTeX ngay
// khi nap vao editor. formatMathSymbols idempotent nen chay tren de moi cung
// vo hai; lan auto-save ke tiep se ghi de ban da nang cap.
function normalizeExamMath(blocks) {
  if (!Array.isArray(blocks)) return blocks;
  blocks.forEach(b => (b.questions || []).forEach(q => {
    if (q.content) q.content = formatMathSymbols(q.content);
    if (q.explanation) q.explanation = formatMathSymbols(q.explanation);
    if (q.correct_answer) q.correct_answer = formatMathSymbols(q.correct_answer);
    (q.options || []).forEach(o => { if (o.option_text) o.option_text = formatMathSymbols(o.option_text); });
  }));
  return blocks;
}

// De luu tu ban cu co the da mat phan trong ngoac cua cong thuc (vd "\sqrt"
// mat "{2xy}", doan giua "<" va ">" bi xoa) ngay luc luu - du lieu goc khong
// con nen khong tu sua duoc; chi bao giao vien cau nao can sua tay.
const BROKEN_LATEX = /\\(?:sqrt(?![\s]*[{[])|d?frac(?![\s]*\{))/;
function warnBrokenMath(blocks) {
  const broken = [];
  let n = 0;
  for (const b of blocks || []) for (const q of b.questions || []) {
    n++;
    const texts = [q.content, q.explanation, q.correct_answer, ...(q.options || []).map(o => o.option_text)];
    if (texts.some(t => typeof t === 'string' && BROKEN_LATEX.test(t))) broken.push(n);
  }
  if (broken.length) {
    showError(`⚠️ Đề này có công thức bị hỏng từ lúc lưu (mất phần trong ngoặc, ví dụ "\\sqrt" thiếu "{...}") ở câu ${broken.join(', ')}. Dữ liệu gốc không còn nên cần sửa tay — hoặc mở bản khác của đề trong 📚 Lịch sử nếu có.`);
  }
}

// ---------- Render ----------
// renderExamInto/renderQuestionCard/... nhan `ctx = { blocks, rerender }` de
// dung chung duoc cho ca de goc (examContainerEl + state.blocks) lan tung
// ma de sinh ra o Task 3 (moi ma de co container + mang blocks rieng, nhung
// van dung chung logic hien thi/sua truc tiep/xoa cau hoi).
function renderExamInto(container, meta, ctx) {
  container.innerHTML = '';
  container.classList.toggle('student-mode', state.isStudentMode);

  if (!ctx.blocks.length) {
    container.innerHTML = '<p class="empty-hint">Chưa có đề thi nào. Hãy nhập dữ liệu ở bảng bên trái và bấm "Sinh Đề Kiểm Tra".</p>';
    return;
  }

  if (meta.codeLabel) {
    const codeLabelEl = document.createElement('div');
    codeLabelEl.className = 'exam-version-code-label';
    codeLabelEl.textContent = `Mã đề: ${meta.codeLabel}`;
    container.appendChild(codeLabelEl);
  }

  const titleBlock = document.createElement('div');
  titleBlock.className = 'exam-title-block';
  const subParts = [];
  if (meta.subject) subParts.push(meta.subject);
  if (meta.duration_minutes) subParts.push(`Thời gian: ${meta.duration_minutes} phút`);
  titleBlock.innerHTML = `
    ${meta.school_header ? `<p class="school-header">${escapeHtml(meta.school_header)}</p>` : ''}
    <h2 class="exam-title">${escapeHtml(meta.title || 'Đề kiểm tra')}</h2>
    ${subParts.length ? `<p class="exam-sub">${escapeHtml(subParts.join(' • '))}</p>` : ''}
  `;
  container.appendChild(titleBlock);

  let questionNo = 0; // danh so lien tuc 1..N cho ca de (chuan de in, khop ban Android)
  ctx.blocks.forEach((block, bi) => {
    const blockEl = document.createElement('div');
    blockEl.className = 'question-block';
    const titleEl = document.createElement('div');
    titleEl.className = 'question-block-title';
    titleEl.textContent = (block.block_title || (block.block_type === 'ESSAY' ? 'Phần Tự luận' : 'Phần Trắc nghiệm')) + blockPointsLabel(block);
    blockEl.appendChild(titleEl);

    block.questions.forEach((q, qi) => {
      questionNo += 1;
      blockEl.appendChild(renderQuestionCard(q, bi, qi, ctx, questionNo));
    });

    container.appendChild(blockEl);
  });
}

// Diem cau den tu template (chuoi thap phan "0.50"); de cu khong co diem thi
// khong hien gi. Cong bang don vi 0,01 de tong phan chinh xac.
function pointsCents(q) {
  const value = q && q.points;
  return typeof value === 'string' && /^\d+(\.\d{1,2})?$/.test(value.trim()) ? Math.round(Number(value) * 100) : null;
}
function questionPointsLabel(q) {
  const cents = pointsCents(q);
  return cents == null ? '' : ` (${(cents / 100).toFixed(2)} điểm)`;
}
function blockPointsLabel(block) {
  const all = (block.questions || []).map(pointsCents);
  if (!all.length || all.some(c => c == null)) return '';
  return ` (${(all.reduce((a, b) => a + b, 0) / 100).toFixed(2)} điểm)`;
}

function renderExam() {
  renderExamInto(examContainerEl, state, { blocks: state.blocks, rerender: renderExam });
}

function renderVersionContainer(version, el) {
  const meta = {
    title: state.title,
    subject: state.subject,
    duration_minutes: state.duration_minutes,
    school_header: state.school_header,
    codeLabel: version.code
  };
  const ctx = { blocks: version.blocks, rerender: () => renderVersionContainer(version, el) };
  renderExamInto(el, meta, ctx);
}

function renderQuestionCard(q, bi, qi, ctx, displayNo) {
  const card = document.createElement('div');
  card.className = 'question-card';

  const head = document.createElement('div');
  head.className = 'question-head';

  const contentWrap = document.createElement('div');
  contentWrap.className = 'question-content';
  const numberSpan = document.createElement('span');
  numberSpan.className = 'question-number';
  numberSpan.textContent = `Câu ${displayNo != null ? displayNo : qi + 1}${questionPointsLabel(q)}: `;
  numberSpan.title = 'Bấm để phóng to / thu gọn câu này';
  numberSpan.addEventListener('click', () => {
    const opened = card.classList.toggle('expanded');
    if (opened) {
      card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      const exBox = card.querySelector('.explanation-box');
      if (exBox && q.explanation) renderExplanationInline(exBox, q.explanation);
    }
  });
  contentWrap.appendChild(numberSpan);

  const contentEditable = document.createElement('span');
  // question-text: white-space pre-line -> cac y a) b) c) moi y mot dong.
  // Doc lai bang innerText (khong phai textContent) de giu xuong dong khi
  // giao vien bam Enter trong o sua (trinh duyet chen <br>/<div>).
  contentEditable.className = 'question-text';
  renderMathInline(contentEditable, q.content);
  contentEditable.contentEditable = String(!state.isStudentMode);
  contentEditable.addEventListener('focus', () => { contentEditable.textContent = q.content; });
  contentEditable.addEventListener('input', () => { q.content = contentEditable.innerText; });
  contentEditable.addEventListener('blur', () => {
    q.content = formatMathSymbols(contentEditable.innerText);
    renderMathInline(contentEditable, q.content);
  });
  contentWrap.appendChild(contentEditable);
  head.appendChild(contentWrap);

  const badge = document.createElement('span');
  badge.className = `badge badge-${q.difficulty_level} teacher-only`;
  badge.textContent = DIFFICULTY_LABEL[q.difficulty_level] || '';
  head.appendChild(badge);

  if (!state.isStudentMode) {
    const actions = document.createElement('div');
    actions.className = 'question-actions';
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'delete-question-btn';
    delBtn.textContent = 'Xóa';
    delBtn.addEventListener('click', () => {
      ctx.blocks[bi].questions.splice(qi, 1);
      ctx.rerender();
      if (ctx.blocks === state.blocks) scheduleArchiveSave();
    });
    actions.appendChild(delBtn);
    head.appendChild(actions);
  }

  card.appendChild(head);

  if (q.question_type === 'MCQ') card.appendChild(renderMCQBody(q, ctx));
  else if (q.question_type === 'TRUE_FALSE') card.appendChild(renderTrueFalseBody(q));
  else if (q.question_type === 'FILL_BLANK') card.appendChild(renderFillBlankBody(q));
  else if (q.question_type === 'ESSAY') card.appendChild(renderEssayBody(q, ctx));

  if (!state.isStudentMode) {
    const expl = document.createElement('div');
    expl.className = 'explanation-box teacher-only';
    expl.contentEditable = 'true';
    expl.dataset.placeholder = 'Nhập lời giải thích / gợi ý...';
    if (q.explanation) renderExplanationInline(expl, q.explanation);
    else expl.textContent = expl.dataset.placeholder;
    expl.addEventListener('focus', () => {
      // Khi sua: hien text phang 1 khoi (khong tach dong) cho de go.
      expl.textContent = expl.textContent === expl.dataset.placeholder ? '' : (q.explanation || '');
    });
    expl.addEventListener('blur', () => {
      if (!expl.textContent.trim()) { q.explanation = ''; expl.textContent = expl.dataset.placeholder; return; }
      q.explanation = formatMathSymbols(expl.innerText);
      renderExplanationInline(expl, q.explanation);
    });
    expl.addEventListener('input', () => { q.explanation = expl.textContent === expl.dataset.placeholder ? '' : expl.innerText; });
    card.appendChild(expl);
  }

  return card;
}

// Ve lời giải: moi cau (ket thuc bang dau cham + khoang trang) xuong 1 dong
// rieng cho de doc. Cac cum $...$ duoc che tam de dau "." ben trong cong thuc
// khong bi coi la het cau; so thap phan "3.14" / dau nhan ngam "α.cos" khong
// co khoang trang sau nen cung khong bi cat.
const EXPL_MATH_MASK = /\$\$[^$]+\$\$|\$[^$]*\$/g;
// Tach loi giai: sau dau cham cau, va tai moi xuong dong co san (y a) b) c)).
const EXPL_SENTENCE_SPLIT = /(?<=\.)[ \t]+(?=\S)|\s*\n\s*/;
function renderExplanationInline(container, text) {
  container.innerHTML = '';
  if (typeof text !== 'string' || !text.trim()) return;

  const spans = [];
  const masked = text.replace(EXPL_MATH_MASK, (s) => `[[MATH${spans.push(s) - 1}]]`);
  const sentences = masked.split(EXPL_SENTENCE_SPLIT).map(s => s.trim()).filter(Boolean);

  sentences.forEach(sen => {
    const line = document.createElement('div');
    line.className = 'explanation-line';
    renderMathInline(line, sen.replace(/\[\[MATH(\d+)\]\]/g, (_, i) => spans[+i]));
    container.appendChild(line);
  });
}

function renderMCQBody(q, ctx) {
  const list = document.createElement('ul');
  list.className = 'options-list';
  q.options.forEach(opt => {
    const li = document.createElement('li');
    li.className = 'option-row' + (opt.is_correct && !state.isStudentMode ? ' is-correct' : '');

    const key = document.createElement('span');
    key.className = 'option-key';
    key.textContent = opt.option_key + '.';
    li.appendChild(key);

    const text = document.createElement('span');
    text.className = 'option-text';
    renderMathInline(text, opt.option_text);
    text.contentEditable = String(!state.isStudentMode);
    text.addEventListener('focus', () => { text.textContent = opt.option_text; });
    text.addEventListener('input', () => { opt.option_text = text.textContent; });
    text.addEventListener('blur', () => {
      opt.option_text = formatMathSymbols(text.textContent);
      renderMathInline(text, opt.option_text);
    });
    li.appendChild(text);

    if (!state.isStudentMode) {
      const markBtn = document.createElement('button');
      markBtn.type = 'button';
      markBtn.className = 'teacher-only';
      markBtn.textContent = opt.is_correct ? '✓ Đúng' : 'Đánh dấu đúng';
      markBtn.addEventListener('click', () => {
        q.options.forEach(o => { o.is_correct = false; });
        opt.is_correct = true;
        q.correct_answer = opt.option_key;
        ctx.rerender();
        if (ctx.blocks === state.blocks) scheduleArchiveSave();
      });
      li.appendChild(markBtn);
    }

    list.appendChild(li);
  });
  return list;
}

function renderTrueFalseBody(q) {
  const wrap = document.createElement('div');
  if (!state.isStudentMode) {
    const select = document.createElement('select');
    select.className = 'true-false-answer teacher-only';
    ['Dung', 'Sai'].forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v === 'Dung' ? 'Đúng' : 'Sai';
      if (q.correct_answer === v) opt.selected = true;
      select.appendChild(opt);
    });
    const printSpan = document.createElement('span');
    printSpan.className = 'true-false-answer-print teacher-only';
    printSpan.textContent = `Đáp án: ${q.correct_answer === 'Dung' ? 'Đúng' : 'Sai'}`;
    select.addEventListener('change', () => {
      q.correct_answer = select.value;
      printSpan.textContent = `Đáp án: ${select.value === 'Dung' ? 'Đúng' : 'Sai'}`;
    });
    wrap.appendChild(select);
    wrap.appendChild(printSpan);
  } else {
    const p = document.createElement('p');
    p.className = 'tf-choices';
    p.textContent = '☐ Đúng      ☐ Sai';
    wrap.appendChild(p);
  }
  return wrap;
}

function renderFillBlankBody(q) {
  const wrap = document.createElement('div');
  if (!state.isStudentMode) {
    const p = document.createElement('p');
    p.className = 'fill-blank-answer teacher-only';
    p.append('Đáp án: ');
    const ans = document.createElement('span');
    ans.contentEditable = 'true';
    // Giong content/explanation: hien LaTeX tho khi dang go (focus), hien
    // ban da render dep (KaTeX/radical) khi roi khoi o (blur) - can thiet
    // tu khi formatMathSymbols giu nguyen $...$ (truoc day chi la Unicode
    // phang nen hien textContent don gian van du dep).
    renderMathInline(ans, q.correct_answer || '');
    ans.addEventListener('focus', () => { ans.textContent = q.correct_answer || ''; });
    ans.addEventListener('input', () => { q.correct_answer = ans.textContent; });
    ans.addEventListener('blur', () => {
      q.correct_answer = formatMathSymbols(ans.textContent);
      renderMathInline(ans, q.correct_answer);
    });
    p.appendChild(ans);
    wrap.appendChild(p);
  } else {
    const p = document.createElement('p');
    p.textContent = 'Trả lời: ....................................';
    wrap.appendChild(p);
  }
  return wrap;
}

function renderEssayBody(q, ctx) {
  const wrap = document.createElement('div');
  const linesWrap = document.createElement('div');
  linesWrap.className = 'essay-draft-lines';
  const count = q.draft_lines_count || 0;
  for (let i = 0; i < count; i++) {
    const line = document.createElement('div');
    line.className = 'draft-line';
    linesWrap.appendChild(line);
  }
  wrap.appendChild(linesWrap);

  if (!state.isStudentMode) {
    const control = document.createElement('div');
    control.className = 'draft-lines-control teacher-only';
    const label = document.createElement('label');
    label.textContent = 'Số dòng nháp:';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.value = count;
    input.addEventListener('change', () => {
      q.draft_lines_count = Math.max(0, parseInt(input.value, 10) || 0);
      ctx.rerender();
    });
    control.appendChild(label);
    control.appendChild(input);
    wrap.appendChild(control);
  }
  return wrap;
}

// ---------- Toolbar: student mode, zoom ----------
document.getElementById('studentModeToggle').addEventListener('change', (e) => {
  state.isStudentMode = e.target.checked;
  renderExam();
  state.examVersions.forEach(version => {
    const el = versionContainers.get(version.code);
    if (el) renderVersionContainer(version, el);
  });
});

document.getElementById('zoomInBtn').addEventListener('click', () => setZoom(state.zoom + 0.1));
document.getElementById('zoomOutBtn').addEventListener('click', () => setZoom(state.zoom - 0.1));

function setZoom(value) {
  state.zoom = Math.min(2, Math.max(0.6, Math.round(value * 100) / 100));
  document.getElementById('previewPanel').style.setProperty('--font-scale', state.zoom);
  document.getElementById('zoomLevelLabel').textContent = `${Math.round(state.zoom * 100)}%`;
}

// ---------- Multi-code exam generator (Task 3) ----------
const multiCodeToggle = document.getElementById('multiCodeToggle');
const multiCodeBody = document.getElementById('multiCodeBody');
multiCodeToggle.addEventListener('click', () => {
  const isOpen = multiCodeBody.classList.toggle('open');
  multiCodeToggle.setAttribute('aria-expanded', String(isOpen));
  // Panel nam trong khu cuon rieng (input-panel) nen khi mo ra co the bi
  // tran khoi vung nhin - tu cuon de nguoi dung thay ngay nut "Tao Ma De"
  // ma khong phai tu tim thanh cuon.
  if (isOpen) {
    const panel = document.getElementById('inputPanel');
    panel.scrollTo({ top: panel.scrollHeight, behavior: 'smooth' });
  }
});

function clearExamVersions() {
  state.examVersions = [];
  state.activeVersionIndex = -1;
  versionContainers.clear();
  document.getElementById('codeTabs').innerHTML = '';
  document.getElementById('multiCodeSummary').textContent = '';
  const wrap = document.getElementById('examVersionsWrap');
  if (wrap) wrap.remove();
  examContainerEl.classList.remove('exam-container-hidden');
}

function statsRangeText(versions) {
  const types = ['MCQ', 'TRUE_FALSE', 'FILL_BLANK', 'ESSAY'];
  const labels = { MCQ: 'TN', TRUE_FALSE: 'Đúng/Sai', FILL_BLANK: 'Điền từ', ESSAY: 'Tự luận' };
  return types
    .map(t => {
      const vals = versions.map(v => v.stats[t]);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      if (min === 0 && max === 0) return null;
      return `${labels[t]}: ${min === max ? min : `${min}–${max}`}`;
    })
    .filter(Boolean)
    .join(', ');
}

function renderExamVersions() {
  versionContainers.clear();
  const codeTabsEl = document.getElementById('codeTabs');
  codeTabsEl.innerHTML = '';

  let wrap = document.getElementById('examVersionsWrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'examVersionsWrap';
    examContainerEl.after(wrap);
  }
  wrap.innerHTML = '';
  examContainerEl.classList.add('exam-container-hidden');

  state.examVersions.forEach((version, i) => {
    const tabBtn = document.createElement('button');
    tabBtn.type = 'button';
    tabBtn.className = 'code-tab-btn' + (i === state.activeVersionIndex ? ' active' : '');
    tabBtn.textContent = version.code;
    tabBtn.addEventListener('click', () => {
      state.activeVersionIndex = i;
      codeTabsEl.querySelectorAll('.code-tab-btn').forEach((b, bi) => b.classList.toggle('active', bi === i));
      wrap.querySelectorAll('.exam-version').forEach((el, ei) => el.classList.toggle('active', ei === i));
    });
    codeTabsEl.appendChild(tabBtn);

    const versionEl = document.createElement('div');
    versionEl.className = 'exam-container exam-version' + (i === state.activeVersionIndex ? ' active' : '');
    wrap.appendChild(versionEl);
    versionContainers.set(version.code, versionEl);
    renderVersionContainer(version, versionEl);
  });

  document.getElementById('multiCodeSummary').textContent =
    `Đã tạo ${state.examVersions.length} mã đề: ${state.examVersions.map(v => v.code).join(', ')}. ` +
    `Số câu mỗi mã đề — ${statsRangeText(state.examVersions)}.`;
}

document.getElementById('generateMultiCodeBtn').addEventListener('click', () => {
  hideError();
  if (!state.blocks.length) { showError('Hãy sinh đề kiểm tra trước khi tạo mã đề.'); return; }

  const q = parseInt(document.getElementById('multiCodeCount').value, 10);
  const startRaw = parseInt(document.getElementById('multiCodeStart').value, 10);
  const prefix = document.getElementById('multiCodePrefix').value.trim() || 'Đề';

  if (!Number.isFinite(q) || q < 2) { showError('Số mã đề (q) phải là số nguyên >= 2.'); return; }

  try {
    const versions = generateExamCodes(state.blocks, q, { prefix, start: Number.isFinite(startRaw) ? startRaw : 101 });
    state.examVersions = versions;
    state.activeVersionIndex = 0;
    renderExamVersions();
  } catch (err) {
    showError(err.message);
  }
});

function toggleActionButtons(enabled) {
  document.getElementById('shuffleOptionsBtn').disabled = !enabled;
  document.getElementById('shareBtn').disabled = !enabled;
  document.getElementById('exportPdfBtn').disabled = !enabled;
  document.getElementById('exportWordBtn').disabled = !enabled;
  document.getElementById('saveExamBtn').disabled = !enabled;
  updateExamBackgroundStatus();
}

// Xao noi dung lua chon TN cua de goc: shuffleMCQOptions gan lai nhan A-D theo
// vi tri moi va tinh lai correct_answer tu is_correct. Cac ma de da tron giu
// nguyen (moi ma de da xao rieng luc tao).
document.getElementById('shuffleOptionsBtn').addEventListener('click', () => {
  const mcqs = state.blocks.flatMap(b => b.questions).filter(q => q.question_type === 'MCQ');
  if (!mcqs.length) { showCopyToast('Đề không có câu trắc nghiệm để xáo.'); return; }
  const broken = mcqs.filter(q => !(q.options || []).some(o => o.is_correct && o.option_key === q.correct_answer));
  if (broken.length) { showError(`Có ${broken.length} câu trắc nghiệm chưa đánh dấu đáp án đúng khớp lựa chọn; sửa trước khi xáo để không sai đáp án.`); return; }
  shuffleAllMCQOptions(state.blocks);
  renderExam();
  scheduleArchiveSave();
  showCopyToast(`🔀 Đã xáo đáp án ${mcqs.length} câu trắc nghiệm${state.examVersions.length ? '. Các mã đề đã tạo giữ nguyên.' : '.'}`);
});

// ---------- Helpers ----------
// Thong bao loi dung chung cho moi tab: tu xoa sau 2 phut (va khi doi tab, xem
// phan Tabs) de loi cua thao tac cu khong treo lai lam nguoi dung hieu nham.
const ERROR_AUTO_CLEAR_MS = 2 * 60 * 1000;
let errorClearTimer = null;
function showError(msg) {
  errorMessageEl.textContent = msg;
  clearTimeout(errorClearTimer);
  errorClearTimer = setTimeout(hideError, ERROR_AUTO_CLEAR_MS);
}
function hideError() {
  clearTimeout(errorClearTimer);
  errorMessageEl.textContent = '';
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function buildExamPayload() {
  return {
    title: state.title,
    subject: state.subject,
    duration_minutes: state.duration_minutes,
    school_header: state.school_header,
    blocks: state.blocks,
    template_binding: state.template_binding,
    background: state.examBackground
  };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- Export PDF (print) ----------
document.getElementById('exportPdfBtn').addEventListener('click', () => {
  window.print();
});

// ---------- Export Word (.docx) ----------
// TextRun cua docx bo qua ky tu "\n": tach thanh nhieu run, run sau co
// break: 1 (ngat dong trong cung doan) de cac y a) b) c) xuong dong that.
function textRunsWithBreaks(text, options = {}) {
  const { TextRun } = docx;
  return String(text ?? '').split(/\r?\n/).map((line, i) => new TextRun({ ...options, text: line, break: i > 0 ? 1 : undefined }));
}

function buildWordChildren(meta, blocks) {
  const { Paragraph, TextRun, HeadingLevel, AlignmentType } = docx;
  const children = [];

  if (meta.codeLabel) {
    children.push(new Paragraph({
      children: [new TextRun({ text: `Mã đề: ${meta.codeLabel}`, bold: true })],
      alignment: AlignmentType.RIGHT
    }));
  }
  if (meta.school_header) {
    children.push(new Paragraph({ text: meta.school_header, alignment: AlignmentType.CENTER }));
  }
  children.push(new Paragraph({ text: meta.title || 'Đề kiểm tra', heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }));
  const subParts = [];
  if (meta.subject) subParts.push(`Môn: ${meta.subject}`);
  if (meta.duration_minutes) subParts.push(`Thời gian: ${meta.duration_minutes} phút`);
  if (subParts.length) children.push(new Paragraph({ text: subParts.join('   '), alignment: AlignmentType.CENTER }));
  children.push(new Paragraph({ text: '' }));

  let questionNo = 0; // danh so lien tuc 1..N cho ca de
  blocks.forEach(block => {
    children.push(new Paragraph({ text: (block.block_title || '') + blockPointsLabel(block), heading: HeadingLevel.HEADING_2 }));

    block.questions.forEach((q) => {
      questionNo += 1;
      // latexToPlainText(): Word la text tinh, khong the render KaTeX nhu
      // tren man hinh - phai lam phang LaTeX ($...$) sang Unicode truoc khi
      // dua vao TextRun, tranh hien thi tho nguyen "$\sqrt{16}$" trong file.
      children.push(new Paragraph({
        children: [new TextRun({ text: `Câu ${questionNo}${questionPointsLabel(q)}: `, bold: true }), ...textRunsWithBreaks(latexToPlainText(q.content))]
      }));

      if (q.question_type === 'MCQ') {
        q.options.forEach(opt => {
          children.push(new Paragraph({ text: `   ${opt.option_key}. ${latexToPlainText(opt.option_text)}` }));
        });
        if (!state.isStudentMode) {
          children.push(new Paragraph({
            children: [new TextRun({ text: `Đáp án: ${q.correct_answer}`, italics: true, color: '16A34A' })]
          }));
        }
      } else if (q.question_type === 'TRUE_FALSE') {
        children.push(new Paragraph({ text: '   ☐ Đúng      ☐ Sai' }));
        if (!state.isStudentMode) {
          children.push(new Paragraph({
            children: [new TextRun({ text: `Đáp án: ${q.correct_answer === 'Dung' ? 'Đúng' : 'Sai'}`, italics: true, color: '16A34A' })]
          }));
        }
      } else if (q.question_type === 'FILL_BLANK') {
        children.push(new Paragraph({ text: '   Trả lời: ....................................' }));
        if (!state.isStudentMode) {
          children.push(new Paragraph({
            children: [new TextRun({ text: `Đáp án: ${latexToPlainText(q.correct_answer) || ''}`, italics: true, color: '16A34A' })]
          }));
        }
      } else if (q.question_type === 'ESSAY') {
        const lines = q.draft_lines_count || 0;
        for (let i = 0; i < lines; i++) {
          children.push(new Paragraph({ text: '.......................................................................' }));
        }
      }

      if (!state.isStudentMode && q.explanation) {
        // Moi cau lời giải mot dong rieng cho de doc (giong khu Xem truoc).
        const explSentences = latexToPlainText(q.explanation).split(EXPL_SENTENCE_SPLIT).map(s => s.trim()).filter(Boolean);
        explSentences.forEach((sen, si) => {
          children.push(new Paragraph({
            children: [new TextRun({ text: `${si === 0 ? 'Giải thích: ' : '   '}${sen}`, italics: true, color: '92400E' })]
          }));
        });
      }
      children.push(new Paragraph({ text: '' }));
    });
  });

  return children;
}

async function exportToWord() {
  const { Document, Packer, Paragraph, PageBreak } = docx;
  const meta = { title: state.title, subject: state.subject, duration_minutes: state.duration_minutes, school_header: state.school_header };

  let children;
  if (state.examVersions.length) {
    children = [];
    state.examVersions.forEach((version, i) => {
      if (i > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
      children.push(...buildWordChildren({ ...meta, codeLabel: version.code }, version.blocks));
    });
  } else {
    children = buildWordChildren(meta, state.blocks);
  }

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  const filename = `${(state.title || 'de-kiem-tra').replace(/\s+/g, '_')}.docx`;
  downloadBlob(blob, filename);
}
// De tao tu mau (co template_binding, khong tron ma de, con du cau cua mau) ->
// hoi ban in roi xuat DOCX theo bo cuc mau; con lai xuat kieu thuong nhu cu.
const wordExportDialog = document.getElementById('wordExportDialog');
function templateExportCandidate() {
  const snapshot = state.template_binding?.template_snapshot;
  if (!snapshot || state.examVersions.length) return null;
  return fillTemplateFromBlocks(snapshot, state.blocks);
}
async function exportTemplateWord(filled, mode) {
  const input = templateExportInput(filled, mode, { exam_title: state.title, subject: state.subject,
    duration_minutes: state.duration_minutes, school: state.school_header });
  const response = await fetch('/api/template-export/docx', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Xuất DOCX thất bại');
  const suffix = { student: 'hoc-sinh', teacher: 'giao-vien', answer_key: 'dap-an', combined: 'de-va-dap-an' }[mode] || mode;
  downloadBlob(await response.blob(), `${(state.title || 'de-kiem-tra').replace(/\s+/g, '_')}_${suffix}.docx`);
  if (response.headers.get('X-Pagination-Overflow') === 'true') showCopyToast(`⚠️ Ước lượng ${response.headers.get('X-Estimated-Pages')} trang, vượt giới hạn trang của mẫu. Kiểm tra lại trong Word.`, 6000);
}
document.getElementById('exportWordBtn').addEventListener('click', () => {
  const candidate = templateExportCandidate();
  if (!candidate) {
    exportToWord().catch(err => showError('Lỗi xuất Word: ' + err.message));
    return;
  }
  const name = state.template_binding.template_snapshot.display_name;
  document.getElementById('wordExportInfo').textContent = candidate.ok
    ? `Đề này tạo từ mẫu "${name}". Chọn bản in để xuất Word đúng bố cục mẫu (điểm, vùng trả lời, khổ giấy, số cột).`
    : `Đề này tạo từ mẫu "${name}" nhưng đã thêm/bớt câu so với mẫu, nên không xuất theo mẫu được. Hãy dùng "Xuất kiểu thường".`;
  document.getElementById('wordExportTemplateBtn').disabled = !candidate.ok;
  document.getElementById('wordExportMode').value = state.isStudentMode ? 'student' : 'teacher';
  document.getElementById('wordExportError').textContent = '';
  wordExportDialog.showModal();
});
document.getElementById('wordExportCancelBtn').addEventListener('click', () => wordExportDialog.close());
document.getElementById('wordExportPlainBtn').addEventListener('click', () => {
  wordExportDialog.close();
  exportToWord().catch(err => showError('Lỗi xuất Word: ' + err.message));
});
document.getElementById('wordExportTemplateBtn').addEventListener('click', async () => {
  const candidate = templateExportCandidate();
  if (!candidate?.ok) return;
  const btn = document.getElementById('wordExportTemplateBtn');
  btn.disabled = true;
  try {
    await exportTemplateWord(candidate.template, document.getElementById('wordExportMode').value);
    wordExportDialog.close();
  } catch (err) {
    document.getElementById('wordExportError').textContent = 'Lỗi xuất Word theo mẫu: ' + err.message;
  } finally {
    btn.disabled = false;
  }
});

// ---------- Share link ----------
// "localhost" chi tro ve chinh may dang mo: khi giao vien dang mo app bang
// localhost, thay bang IP LAN cua may chay server de may khac cung mang mo duoc.
async function shareOrigin() {
  const isLocal = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname);
  if (!isLocal) return { origin: location.origin, hint: '' };
  try {
    const data = await (await fetch('/api/network-info')).json();
    const ip = data.success && data.addresses[0];
    if (ip) {
      return { origin: `${location.protocol}//${ip}:${data.port || location.port}`,
        hint: `Máy khác cùng mạng Wi-Fi/LAN với máy này mở được link khi ExamBuilder trên máy này đang chạy. Lần đầu Windows có thể hỏi tường lửa cho Node.js — chọn "Cho phép" (mạng Riêng tư). Máy ở mạng khác (4G, nhà khác) chưa mở được.` };
    }
  } catch { /* khong lay duoc IP LAN - dung localhost va bao ro ben duoi */ }
  return { origin: location.origin, hint: 'Không tìm thấy mạng LAN/Wi-Fi: link "localhost" chỉ mở được trên chính máy này.' };
}

async function generateShareLink() {
  const payload = buildExamPayload();
  const json = JSON.stringify(payload);
  // Link ?data= nam trong tay hoc sinh: chi ma hoa ban da bo dap an/loi giai.
  const base64 = btoa(unescape(encodeURIComponent(JSON.stringify(redactExamForStudent(payload)))));

  const { origin, hint: networkHint } = await shareOrigin();
  let url;
  let shareCode = null;
  if (base64.length < 1800) {
    url = `${origin}${location.pathname}?data=${encodeURIComponent(base64)}`;
  } else {
    try {
      const saveRes = await fetch('/api/exams/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: json
      });
      const saveData = await saveRes.json();
      if (!saveData.success) throw new Error(saveData.error);
      state.examId = saveData.exam_id;

      const shareRes = await fetch('/api/exams/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exam_id: state.examId })
      });
      const shareData = await shareRes.json();
      if (!shareData.success) throw new Error(shareData.error);
      shareCode = shareData.share_code;
      url = `${origin}${location.pathname}?code=${shareCode}`;
    } catch (err) {
      showError('Không thể tạo link chia sẻ qua máy chủ: ' + err.message);
      return;
    }
  }

  state.activeShareCode = shareCode;
  document.getElementById('shareLinkOutput').value = url;
  document.getElementById('shareNetworkHint').textContent = networkHint;

  const revokeBtn = document.getElementById('revokeShareLinkBtn');
  const revokeHint = document.getElementById('shareRevokeHint');
  revokeBtn.classList.toggle('form-hidden', !shareCode);
  revokeBtn.disabled = false;
  revokeBtn.textContent = 'Thu hồi link';
  revokeHint.textContent = shareCode
    ? ''
    : 'Link dạng dán trực tiếp dữ liệu vào URL, không lưu trên máy chủ nên không thể thu hồi.';

  document.getElementById('shareModal').classList.add('open');
}
document.getElementById('shareBtn').addEventListener('click', () => {
  generateShareLink().catch(err => showError('Lỗi tạo link chia sẻ: ' + err.message));
});
document.getElementById('copyShareLinkBtn').addEventListener('click', async () => {
  const input = document.getElementById('shareLinkOutput');
  input.select();
  try {
    await navigator.clipboard.writeText(input.value);
  } catch {
    document.execCommand('copy');
  }
});
document.getElementById('revokeShareLinkBtn').addEventListener('click', async () => {
  if (!state.activeShareCode) return;
  const revokeBtn = document.getElementById('revokeShareLinkBtn');
  try {
    const res = await fetch(`/api/exams/share/${state.activeShareCode}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    revokeBtn.disabled = true;
    revokeBtn.textContent = 'Đã thu hồi';
    document.getElementById('shareRevokeHint').textContent = 'Link này đã bị vô hiệu hoá, sẽ không còn mở được nữa.';
  } catch (err) {
    showError('Lỗi thu hồi link chia sẻ: ' + err.message);
  }
});
document.getElementById('closeShareModalBtn').addEventListener('click', () => {
  document.getElementById('shareModal').classList.remove('open');
});

// ---------- Sinh de tu dong bang LLM (module cong them) ----------
let cachedModels = [];
let cachedLiveCloudModels = []; // [{provider, model_name, display_name}] - lay live tu API, khong luu DB
let cachedResources = [];
const CLOUD_PROVIDER_LABELS = { openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Gemini', deepseek: 'DeepSeek' };

function modelLabel(m) {
  const kind = m.source_type === 'local_gguf' ? 'Local' : (m.provider || '').toUpperCase();
  return `${m.display_name} (${kind})`;
}

async function loadModels() {
  try {
    const res = await fetch('/api/models');
    const data = await res.json();
    cachedModels = data.success ? data.models : [];
  } catch {
    cachedModels = [];
  }
  renderModelSelect();
  renderModelManagerList();
}

function renderModelSelect() {
  const select = document.getElementById('autoModelSelect');
  const prev = select.value;
  const groups = [];

  const localModels = cachedModels.filter(m => m.source_type === 'local_gguf');
  if (localModels.length) {
    groups.push(`<optgroup label="Model cục bộ">${
      localModels.map(m => `<option value="local:${m.model_id}">${escapeHtml(m.display_name)}</option>`).join('')
    }</optgroup>`);
  }

  // Model cloud lo dang ky thu cong tu truoc (co san trong LLM_MODEL) - van
  // cho chon de tuong thich nguoc, gom rieng khoi tranh lan voi model live.
  const legacyCloudModels = cachedModels.filter(m => m.source_type === 'cloud');
  if (legacyCloudModels.length) {
    groups.push(`<optgroup label="Đã đăng ký (cũ)">${
      legacyCloudModels.map(m => `<option value="legacy:${m.model_id}">${escapeHtml(modelLabel(m))}</option>`).join('')
    }</optgroup>`);
  }

  for (const providerKey of Object.keys(CLOUD_PROVIDER_LABELS)) {
    const items = cachedLiveCloudModels.filter(m => m.provider === providerKey);
    if (items.length) {
      groups.push(`<optgroup label="${CLOUD_PROVIDER_LABELS[providerKey]}">${
        items.map(m => `<option value="cloud:${providerKey}:${m.model_name}">${escapeHtml(m.display_name)}</option>`).join('')
      }</optgroup>`);
    }
  }

  select.innerHTML = groups.length
    ? groups.join('')
    : '<option value="">— Chưa có model, hãy lưu API key hoặc tải model local trong Cài đặt —</option>';

  const allValues = new Set([
    ...localModels.map(m => `local:${m.model_id}`),
    ...legacyCloudModels.map(m => `legacy:${m.model_id}`),
    ...cachedLiveCloudModels.map(m => `cloud:${m.provider}:${m.model_name}`)
  ]);
  if (allValues.has(prev)) select.value = prev;
}

function showSettingsStatus(msg) {
  document.getElementById('uploadLocalModelStatus').textContent = msg;
}

function renderModelManagerList() {
  const list = document.getElementById('modelManagerList');
  list.innerHTML = '';
  cachedModels.forEach(m => {
    const li = document.createElement('li');
    li.className = 'form-question-item';

    const info = document.createElement('div');
    info.className = 'form-question-item-info';
    const sizeInfo = m.file_size ? ` · ${(m.file_size / (1024 * 1024)).toFixed(0)}MB` : '';
    info.innerHTML = `<strong>${escapeHtml(modelLabel(m))}</strong><span>${escapeHtml(m.model_name || '')}${sizeInfo}</span>`;

    const actions = document.createElement('div');
    actions.className = 'form-question-item-actions';

    if (m.source_type === 'cloud') {
      const testBtn = document.createElement('button');
      testBtn.type = 'button';
      testBtn.className = 'edit-btn';
      testBtn.textContent = 'Kiểm tra';
      testBtn.addEventListener('click', async () => {
        testBtn.textContent = '...';
        try {
          const res = await fetch('/api/settings/llm/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: m.provider, model_name: m.model_name })
          });
          const data = await res.json();
          testBtn.textContent = data.success ? '✅ OK' : '❌ Lỗi';
          if (!data.success) showSettingsStatus(data.error);
        } catch (err) {
          testBtn.textContent = '❌ Lỗi';
          showSettingsStatus(err.message);
        }
        setTimeout(() => { testBtn.textContent = 'Kiểm tra'; }, 3000);
      });
      actions.appendChild(testBtn);
    }

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'delete-btn';
    delBtn.textContent = 'Xóa';
    delBtn.addEventListener('click', async () => {
      try {
        const res = await fetch(`/api/models/${m.model_id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        loadModels();
      } catch (err) {
        showSettingsStatus('Lỗi xóa model: ' + err.message);
      }
    });
    actions.appendChild(delBtn);

    li.appendChild(info);
    li.appendChild(actions);
    list.appendChild(li);
  });
}

async function loadProviderKeyStatus() {
  try {
    const res = await fetch('/api/settings/llm');
    const data = await res.json();
    const configured = new Set((data.success ? data.providers : []).map(p => p.provider));
    document.querySelectorAll('.settings-provider-row').forEach(row => {
      const status = row.querySelector('.provider-status');
      status.textContent = configured.has(row.dataset.provider) ? '✅ Đã lưu key' : 'Chưa cấu hình';
    });
  } catch {
    // Giu nguyen trang thai hien tai, khong chan viec mo modal.
  }
}

async function loadLiveCloudModels() {
  cachedLiveCloudModels = [];
  try {
    const res = await fetch('/api/settings/llm');
    const data = await res.json();
    const providers = data.success ? data.providers.map(p => p.provider) : [];
    for (const provider of providers) {
      try {
        const mRes = await fetch('/api/settings/llm/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider })
        });
        const mData = await mRes.json();
        if (mData.success) {
          for (const m of mData.models) {
            cachedLiveCloudModels.push({ provider, model_name: m.id, display_name: m.display_name || m.id });
          }
        }
      } catch {
        // Provider nay loi (key sai, mat mang...) - bo qua, khong chan cac provider khac.
      }
    }
  } catch {
    // Khong lay duoc danh sach provider da luu key - giu cachedLiveCloudModels rong.
  }
  renderModelSelect();
}

document.querySelectorAll('.save-key-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const row = btn.closest('.settings-provider-row');
    const input = row.querySelector('.provider-key-input');
    const apiKey = input.value.trim();
    if (!apiKey) { showSettingsStatus('Vui lòng nhập API key.'); return; }
    try {
      const res = await fetch('/api/settings/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: row.dataset.provider, api_key: apiKey })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      input.value = '';
      loadProviderKeyStatus();
      loadLiveCloudModels();
    } catch (err) {
      showSettingsStatus('Lỗi lưu API key: ' + err.message);
    }
  });
});

document.getElementById('uploadLocalModelBtn').addEventListener('click', async () => {
  const fileInput = document.getElementById('localModelFile');
  const file = fileInput.files[0];
  if (!file) { showSettingsStatus('Vui lòng chọn file .gguf.'); return; }

  const formData = new FormData();
  formData.append('model_file', file);
  const displayName = document.getElementById('localModelDisplay').value.trim();
  if (displayName) formData.append('display_name', displayName);

  showSettingsStatus('Đang tải lên... có thể mất nhiều phút với file lớn, đừng đóng cửa sổ.');
  try {
    const res = await fetch('/api/models/local', { method: 'POST', body: formData });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    showSettingsStatus('✅ Đã tải lên thành công.');
    fileInput.value = '';
    document.getElementById('localModelDisplay').value = '';
    loadModels();
  } catch (err) {
    showSettingsStatus('❌ Lỗi tải model: ' + err.message);
  }
});

document.getElementById('settingsBtn').addEventListener('click', () => {
  loadProviderKeyStatus();
  loadModels();
  syncAppearanceUI();
  document.getElementById('settingsModal').classList.add('open');
});
document.getElementById('closeSettingsModalBtn').addEventListener('click', () => {
  document.getElementById('settingsModal').classList.remove('open');
  loadLiveCloudModels(); // phan anh key vua luu/xoa vao dropdown Model ma khong can tai lai trang
});

// ---------- Cai dat > Giao dien (chu de mau + co chu) ----------
// Danh sach theme lay TU CHINH cac nut trong #themeGrid (index.html) -> them
// theme moi chi can them 1 nut o do + 1 khoi CSS, khong sua file nay.
const THEME_IDS = [...document.querySelectorAll('#themeGrid .theme-card')].map(b => b.dataset.theme);
const THEME_MIGRATE = { blue: 'cold', teal: 'ocean', forest: 'meadow', amber: 'summer', violet: 'blossom' };

function currentTheme() {
  let t;
  try { t = localStorage.getItem('eb_theme'); } catch { t = null; }
  if (THEME_MIGRATE[t]) t = THEME_MIGRATE[t];
  return THEME_IDS.includes(t) ? t : 'cold';
}
function currentScale() {
  try { return parseFloat(localStorage.getItem('eb_uiScale')) || 1; } catch { return 1; }
}
// Moc thoi gian lan cuoi nguoi dung doi theme - dung cho dong bo Gist ("lan doi
// gan nhat thang"). Chua tung doi -> epoch => luon thua may da doi.
function currentThemeAt() {
  try { return localStorage.getItem('eb_theme_at') || '1970-01-01T00:00:00.000Z'; }
  catch { return '1970-01-01T00:00:00.000Z'; }
}
// Ap theme nhan tu Gist (khi Pull/Push tra ve ban moi hon). Tra ve true neu doi.
function adoptSyncedTheme(theme) {
  if (!theme || typeof theme.id !== 'string') return false;
  let id = theme.id;
  if (THEME_MIGRATE[id]) id = THEME_MIGRATE[id];
  if (!THEME_IDS.includes(id) || id === currentTheme()) return false;
  try {
    localStorage.setItem('eb_theme', id);
    localStorage.setItem('eb_theme_at', theme.updated_at || new Date().toISOString());
    localStorage.removeItem('eb_mode');
  } catch {}
  applyAppearance();
  syncAppearanceUI();
  return true;
}

function applyAppearance() {
  const root = document.documentElement;
  const t = currentTheme();
  if (t === 'cold') delete root.dataset.theme;
  else root.dataset.theme = t;
  delete root.dataset.mode; // khong con dung che do toi rieng
  root.style.setProperty('--ui-scale', String(currentScale()));
}

function syncAppearanceUI() {
  const t = currentTheme();
  document.querySelectorAll('#themeGrid .theme-card').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === t);
  });
  const sc = currentScale();
  document.querySelectorAll('#fontSizeGroup button').forEach(b => {
    b.classList.toggle('active', parseFloat(b.dataset.scale) === sc);
  });
}

document.querySelectorAll('#themeGrid .theme-card').forEach(btn => {
  btn.addEventListener('click', () => {
    try {
      localStorage.setItem('eb_theme', btn.dataset.theme);
      localStorage.setItem('eb_theme_at', new Date().toISOString());
      localStorage.removeItem('eb_mode');
    } catch {}
    applyAppearance();
    syncAppearanceUI();
  });
});
document.querySelectorAll('#fontSizeGroup button').forEach(btn => {
  btn.addEventListener('click', () => {
    try { localStorage.setItem('eb_uiScale', btn.dataset.scale); } catch {}
    applyAppearance();
    syncAppearanceUI();
  });
});

applyAppearance();
syncAppearanceUI();

// ---------- Thu vien tai lieu ----------
async function loadResources() {
  try {
    const res = await fetch('/api/resources');
    const data = await res.json();
    cachedResources = data.success ? data.documents : [];
  } catch {
    cachedResources = [];
  }
  renderDocSelect();
  renderDocListForSections();
  loadResourceHistory();
}

// Lich su thu vien tai lieu (moi nhat truoc), lay tu RESOURCE_HISTORY o server.
const RESOURCE_ACTION_LABELS = {
  create_doc: 'Tạo tài liệu', add_section: 'Thêm phần', upload_section: 'Tải file lên', delete_doc: 'Xóa tài liệu'
};
async function loadResourceHistory() {
  const list = document.getElementById('resourceHistory');
  try {
    const data = await (await fetch('/api/resources/history?limit=30')).json();
    const rows = data.success ? data.history : [];
    list.replaceChildren();
    if (!rows.length) { list.append(Object.assign(document.createElement('li'), { className: 'hint', textContent: 'Chưa có thay đổi nào.' })); return; }
    for (const h of rows) {
      const li = document.createElement('li');
      const when = new Date(h.created_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
      const target = h.section_title ? `"${h.section_title}" → "${h.doc_title || ''}"` : `"${h.doc_title || ''}"`;
      li.textContent = `${when} · ${RESOURCE_ACTION_LABELS[h.action] || h.action} ${target}${h.action === 'upload_section' && h.detail ? ` (${h.detail})` : ''}`;
      list.append(li);
    }
  } catch {
    list.replaceChildren(Object.assign(document.createElement('li'), { className: 'hint', textContent: 'Không tải được lịch sử.' }));
  }
}
const RESOURCE_TOAST_MS = 5000;

// Thu vien tai lieu mo trong dialog rieng (chong len bang sinh de) nen thong bao
// hien ngay trong dialog - #errorMessage/#copyToast cua trang chinh bi che.
const resourceManagerDialog = document.getElementById('resourceManagerDialog');
function resourceNotice(msg, isError = false) {
  const el = document.getElementById('resourceManagerStatus');
  el.textContent = msg;
  el.classList.toggle('error', isError);
  if (!isError) showCopyToast(msg, RESOURCE_TOAST_MS);
}
document.getElementById('openResourceManagerBtn').addEventListener('click', () => {
  document.getElementById('resourceManagerStatus').textContent = '';
  if (!resourceManagerDialog.open) resourceManagerDialog.showModal();
});
document.getElementById('resourceManagerCloseBtn').addEventListener('click', () => resourceManagerDialog.close());

function updateSectionSummary() {
  const boxes = [...document.querySelectorAll('#autoSectionCheckboxes input[type="checkbox"]')];
  const checked = boxes.filter(b => b.checked).length;
  document.getElementById('autoSectionSummary').textContent = !checked || checked === boxes.length
    ? `Phần tài liệu AI đọc: tất cả (${boxes.length} phần)`
    : `Phần tài liệu AI đọc: ${checked}/${boxes.length} phần`;
}

function renderSectionCheckboxes() {
  const wrap = document.getElementById('autoSectionCheckboxes');
  const details = document.getElementById('autoSectionDetails');
  const docId = document.getElementById('autoDocSelect').value;
  const doc = cachedResources.find(d => d.doc_id === docId);
  if (!doc || !doc.sections.length) {
    wrap.innerHTML = '';
    details.hidden = true;
    return;
  }
  wrap.innerHTML = doc.sections.map(s => `
    <label class="section-checkbox-label">
      <input type="checkbox" value="${s.section_id}" checked />
      ${escapeHtml(s.section_title)}
    </label>
  `).join('');
  details.hidden = false;
  updateSectionSummary();
}
document.getElementById('autoSectionCheckboxes').addEventListener('change', updateSectionSummary);

function renderDocSelect() {
  const select = document.getElementById('autoDocSelect');
  const prev = select.value;
  select.innerHTML = '<option value="">— Không dùng tài liệu —</option>' +
    cachedResources.map(d => `<option value="${d.doc_id}">${escapeHtml(d.title)}</option>`).join('');
  if (cachedResources.some(d => d.doc_id === prev)) select.value = prev;
  renderSectionCheckboxes();
}
document.getElementById('autoDocSelect').addEventListener('change', renderSectionCheckboxes);

document.getElementById('addDocBtn').addEventListener('click', async () => {
  const title = document.getElementById('newDocTitle').value.trim();
  const subject = document.getElementById('newDocSubject').value.trim();
  if (!title) { resourceNotice('Vui lòng nhập tên tài liệu.', true); return; }
  try {
    const res = await fetch('/api/resources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, subject })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    document.getElementById('newDocTitle').value = '';
    document.getElementById('newDocSubject').value = '';
    resourceNotice(`✅ Đã thêm tài liệu "${title}" thành công.`);
    loadResources();
  } catch (err) {
    resourceNotice('Lỗi tạo tài liệu: ' + err.message, true);
  }
});

function renderDocListForSections() {
  const wrap = document.getElementById('docListForSections');
  wrap.innerHTML = '';
  if (!cachedResources.length) {
    wrap.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: 'Chưa có tài liệu nào. Nhập tên ở trên rồi bấm "+ Tạo tài liệu".' }));
  }
  cachedResources.forEach(doc => {
    const box = document.createElement('div');
    box.className = 'doc-sections-box';

    const title = document.createElement('strong');
    title.textContent = `${doc.title}${doc.subject ? ' · ' + doc.subject : ''} (${doc.sections.length} phần)`;
    box.appendChild(title);
    if (doc.sections.length) {
      const sectionList = document.createElement('ul');
      sectionList.className = 'doc-section-names';
      doc.sections.forEach(sec => sectionList.append(Object.assign(document.createElement('li'), { textContent: sec.section_title })));
      box.appendChild(sectionList);
    }

    const sectionTitleInput = document.createElement('input');
    sectionTitleInput.type = 'text';
    sectionTitleInput.placeholder = 'Tên phần (VD: Chương 1 - Số nguyên)';
    const sectionContentInput = document.createElement('textarea');
    sectionContentInput.rows = 3;
    sectionContentInput.placeholder = 'Nội dung phần (dán nguyên văn từ giáo trình)...';

    const addSectionBtn = document.createElement('button');
    addSectionBtn.type = 'button';
    addSectionBtn.className = 'secondary-btn';
    addSectionBtn.textContent = '+ Thêm phần';
    addSectionBtn.addEventListener('click', async () => {
      const section_title = sectionTitleInput.value.trim();
      const content = sectionContentInput.value.trim();
      if (!section_title || !content) { resourceNotice('Vui lòng nhập tên phần và nội dung.', true); return; }
      try {
        const res = await fetch(`/api/resources/${doc.doc_id}/sections`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ section_title, content })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        resourceNotice(`✅ Đã thêm phần "${section_title}" vào tài liệu "${doc.title}" thành công.`);
        loadResources();
      } catch (err) {
        resourceNotice('Lỗi thêm phần: ' + err.message, true);
      }
    });

    const sectionFileInput = document.createElement('input');
    sectionFileInput.type = 'file';
    sectionFileInput.accept = '.txt,.docx,.pdf';

    const uploadSectionBtn = document.createElement('button');
    uploadSectionBtn.type = 'button';
    uploadSectionBtn.className = 'secondary-btn';
    uploadSectionBtn.textContent = '📤 Tải file lên';
    uploadSectionBtn.addEventListener('click', async () => {
      const file = sectionFileInput.files[0];
      if (!file) { resourceNotice('Vui lòng chọn file (.txt, .docx, .pdf) trước.', true); return; }
      const formData = new FormData();
      formData.append('file', file);
      const section_title = sectionTitleInput.value.trim();
      if (section_title) formData.append('section_title', section_title);
      try {
        const res = await fetch(`/api/resources/${doc.doc_id}/sections/upload`, { method: 'POST', body: formData });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        sectionFileInput.value = '';
        resourceNotice(`✅ Đã tải "${file.name}" vào tài liệu "${doc.title}" thành công.`);
        loadResources();
      } catch (err) {
        resourceNotice('Lỗi tải file: ' + err.message, true);
      }
    });

    const delDocBtn = document.createElement('button');
    delDocBtn.type = 'button';
    delDocBtn.className = 'delete-btn';
    delDocBtn.textContent = 'Xóa tài liệu';
    delDocBtn.addEventListener('click', async () => {
      if (!confirm(`Xóa tài liệu "${doc.title}" và ${doc.sections.length} phần bên trong?`)) return;
      try {
        const res = await fetch(`/api/resources/${doc.doc_id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        resourceNotice(`🗑️ Đã xóa tài liệu "${doc.title}".`);
        loadResources();
      } catch (err) {
        resourceNotice('Lỗi xóa tài liệu: ' + err.message, true);
      }
    });

    box.appendChild(sectionTitleInput);
    box.appendChild(sectionContentInput);
    box.appendChild(addSectionBtn);
    box.appendChild(sectionFileInput);
    box.appendChild(uploadSectionBtn);
    box.appendChild(delDocBtn);
    wrap.appendChild(box);
  });
}

// ---------- Nut "Sinh de tu dong" ----------
function collectQuestionSpec() {
  const spec = [];
  document.querySelectorAll('#autoSpecTable input[type="number"]').forEach(input => {
    const so_luong = parseInt(input.value, 10);
    if (Number.isFinite(so_luong) && so_luong > 0) {
      spec.push({ loai: input.dataset.loai, muc_do: input.dataset.mucDo, so_luong });
    }
  });
  return spec;
}

// The tom tat cau truc de se sinh: theo mau (neu chon Khung de), theo bang so
// cau (neu co dien), hoac theo yeu cau viet tay. Bang chi tiet an khi dung mau.
function updateSpecSummary() {
  const chip = document.getElementById('autoStructureChip');
  const frame = selectedFrame();
  document.getElementById('autoSpecDetails').hidden = Boolean(frame);
  if (frame) { chip.textContent = `📐 Theo mẫu "${frame.display_name}": ${describeTemplate(frame)}`; return; }
  const total = collectQuestionSpec().reduce((n, s) => n + s.so_luong, 0);
  chip.textContent = total
    ? `📊 Theo bảng: ${total} câu (ưu tiên hơn yêu cầu viết tay)`
    : '📝 Số câu: theo yêu cầu viết tay (không ghi thì AI dùng số câu mặc định)';
}

// ---------- Khung de (mau) cho sinh de qua API ----------
// Chon mau -> gui prompt P1 cua mau (co Ma_Khung/Diem) qua job raw_prompt, roi
// /api/template-prompts/prepare ghep ket qua vao dung slot. Cau truc lay tu mau.
let cachedFrames = [];
function selectedFrame() {
  const id = document.getElementById('autoFrameSelect').value;
  return id ? cachedFrames.find(t => t.template_id === id) || null : null;
}
function renderFrameSelect() {
  const select = document.getElementById('autoFrameSelect');
  const prev = select.value;
  const option = t => `<option value="${escapeHtml(t.template_id)}">${escapeHtml(t.display_name)} (${escapeHtml(describeTemplate(t))})</option>`;
  const builtin = cachedFrames.filter(t => t.is_builtin);
  const mine = cachedFrames.filter(t => !t.is_builtin);
  select.innerHTML = '<option value="">Đề tự do (AI tự chia câu)</option>' +
    (builtin.length ? `<optgroup label="Mẫu gốc">${builtin.map(option).join('')}</optgroup>` : '') +
    (mine.length ? `<optgroup label="Mẫu của tôi">${mine.map(option).join('')}</optgroup>` : '');
  if (cachedFrames.some(t => t.template_id === prev)) select.value = prev;
  updateSpecSummary();
}
async function loadFrames() {
  try {
    const data = await (await fetch('/api/templates')).json();
    if (data.success) cachedFrames = data.templates;
  } catch {
    // Giu danh sach cu; khong chan sinh de tu do.
  }
  renderFrameSelect();
}
document.getElementById('autoFrameSelect').addEventListener('change', updateSpecSummary);
document.querySelectorAll('#autoSpecTable input[type="number"]').forEach(input => input.addEventListener('input', updateSpecSummary));

// Mui ten trai/phai chuyen o (theo hang, het hang thi sang hang ke); len/xuong
// giu mac dinh tang/giam so. O number khong co vi tri con tro nen luon chuyen o.
// Vao o thi boi den so de go de luon.
const specInputs = [...document.querySelectorAll('#autoSpecTable input[type="number"]')];
specInputs.forEach((input, index) => {
  input.addEventListener('focus', () => input.select());
  input.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const next = specInputs[index + (e.key === 'ArrowRight' ? 1 : -1)];
    if (!next) return;
    e.preventDefault();
    next.focus();
  });
});
updateSpecSummary();

// Yeu cau viet tay co nhac so cau / loai cau / muc do khong (de canh bao khi bang cung co so).
const STRUCTURE_HINT_RE = /\d+\s*(câu|cau)(?![a-zà-ỹ])|trắc nghiệm|trac nghiem|tự luận|tu luan|đúng\s*\/?\s*sai|điền|nhận biết|thông hiểu|vận dụng/i;

// ---------- Bang sinh de tu dong (dialog) ----------
// Bam tab "Sinh de tu dong" hoac nut trong tab -> mo bang lon. Sinh de chay qua
// job (/api/generate/jobs) de hien tien do; AI duoc hoi lai qua khoi [HOI_NGUOI_DUNG].
const autoGenDialog = document.getElementById('autoGenDialog');
const autoGenErrorEl = document.getElementById('autoGenError');
const autoGenResultEl = document.getElementById('autoGenResult');
let autoGenRunning = false;
let autoGenPending = null; // { requestBody, clarifications, questions } khi AI dang hoi
function openAutoGenBoard() { if (!autoGenDialog.open) { autoGenDialog.showModal(); loadFrames(); } }
document.getElementById('openAutoGenBtn').addEventListener('click', openAutoGenBoard);
document.querySelector('.tab-btn[data-tab="auto"]').addEventListener('click', openAutoGenBoard);
document.getElementById('autoGenCloseBtn').addEventListener('click', () => autoGenDialog.close());
function autoGenError(msg) { autoGenErrorEl.textContent = msg; }

const STAGE_ORDER = ['prepare', 'calling', 'checking', 'done'];
function renderAutoGenProgress(job) {
  const box = document.getElementById('autoGenProgress');
  box.hidden = false;
  const stage = job.stage === 'retry' ? 'calling' : (job.stage === 'queued' ? 'prepare' : job.stage);
  const attempt = Math.max(1, job.attempt || 1);
  const max = job.max_attempts || 3;
  // Phan tram uoc luong: moi luot goi AI chiem mot doan; trong luc cho AI, thanh
  // nhich dan theo thoi gian (khong biet truoc AI mat bao lau).
  const slot = 85 / max;
  const base = 8 + (attempt - 1) * slot;
  let pct = 3;
  if (stage === 'prepare') pct = 5;
  else if (stage === 'calling') pct = base + slot * 0.8 * (1 - Math.exp(-(job.elapsed_ms || 0) / 45000));
  else if (stage === 'checking') pct = base + slot * 0.9;
  else if (stage === 'done') pct = 100;
  pct = Math.min(100, Math.max(3, Math.round(pct)));
  document.getElementById('autoGenBarFill').style.width = pct + '%';
  box.querySelector('[role=progressbar]').setAttribute('aria-valuenow', String(pct));
  const secs = Math.round((job.elapsed_ms || 0) / 1000);
  document.getElementById('autoGenStage').textContent = `${pct}% · ${job.message || ''} (${secs} giây)`;
  const idx = STAGE_ORDER.indexOf(stage);
  document.querySelectorAll('#autoGenSteps li').forEach((li, i) => {
    li.classList.toggle('done', i < idx || stage === 'done');
    li.classList.toggle('active', i === idx && stage !== 'done');
    if (li.dataset.step === 'calling') li.textContent = attempt > 1 ? `AI soạn đề (lần ${attempt}/${max})` : 'AI soạn đề';
  });
}

async function buildAutoGenRequest() {
  const selectedValue = document.getElementById('autoModelSelect').value;
  if (!selectedValue) { autoGenError('Vui lòng chọn 1 model (lưu API key hoặc tải model local trong Cài đặt trước).'); return null; }
  const frame = selectedFrame();
  if (frame) return buildFrameRequest(selectedValue, frame);
  const questionSpec = collectQuestionSpec();
  const sectionIds = Array.from(document.querySelectorAll('#autoSectionCheckboxes input:checked')).map(i => i.value);
  const topic = document.getElementById('autoTopicInput').value.trim();
  const extraInstructions = document.getElementById('autoExtraPromptInput').value.trim();
  if (questionSpec.length && STRUCTURE_HINT_RE.test(extraInstructions)) {
    const total = questionSpec.reduce((n, s) => n + s.so_luong, 0);
    if (!confirm([
      `Bảng đang đặt ${total} câu và yêu cầu viết tay cũng nhắc số câu/loại câu/mức độ.`,
      'Khi hai bên khác nhau, AI sẽ làm THEO BẢNG; yêu cầu viết tay chỉ dùng cho chủ đề, dạng bài, phong cách.',
      'Bấm OK để sinh theo bảng, hoặc Hủy rồi đưa bảng về 0 nếu muốn làm theo yêu cầu viết tay.'
    ].join('\n\n'))) return null;
  }
  const requestBody = { section_ids: sectionIds, doc_id: document.getElementById('autoDocSelect').value || null, topic, question_spec: questionSpec, extra_instructions: extraInstructions,
    allow_questions: document.getElementById('autoAllowQuestions').checked };
  return { ...requestBody, ...modelFields(selectedValue) };
}

// "local:<model_id>" / "legacy:<model_id>" -> model_id (LLM_MODEL);
// "cloud:<provider>:<model_name>" -> provider/model_name, khong can dang ky.
function modelFields(selectedValue) {
  if (selectedValue.startsWith('cloud:')) {
    const rest = selectedValue.slice('cloud:'.length);
    const sep = rest.indexOf(':');
    return { provider: rest.slice(0, sep), model_name: rest.slice(sep + 1) };
  }
  if (selectedValue.startsWith('local:') || selectedValue.startsWith('legacy:')) {
    return { model_id: selectedValue.slice(selectedValue.indexOf(':') + 1) };
  }
  return {};
}

async function buildFrameRequest(selectedValue, frame) {
  const fields = modelFields(selectedValue);
  const modelRow = fields.model_id ? cachedModels.find(m => m.model_id === fields.model_id) : null;
  const aiVariant = VARIANT_BY_PROVIDER[fields.provider || modelRow?.provider] || 'ChatGPT';
  const topic = document.getElementById('autoTopicInput').value.trim();
  const extraInstructions = document.getElementById('autoExtraPromptInput').value.trim();
  const subject = document.getElementById('examSubjectInput').value.trim();
  let built;
  try {
    const res = await fetch('/api/template-prompts/build', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template: frame, promptGroup: 'FULL_EXAM', aiVariant, topic,
        examMetadata: subject ? { subject } : {}, teacherExtraInstructions: extraInstructions }) });
    built = await res.json();
    if (!built.success) throw new Error(built.error);
  } catch (err) {
    autoGenError('Không tạo được prompt theo mẫu: ' + err.message);
    return null;
  }
  const sectionIds = Array.from(document.querySelectorAll('#autoSectionCheckboxes input:checked')).map(i => i.value);
  // frame chi dung o trinh duyet (bo ra truoc khi gui server).
  return { ...fields, raw_prompt: built.prompt, topic, extra_instructions: extraInstructions,
    section_ids: sectionIds, doc_id: document.getElementById('autoDocSelect').value || null,
    allow_questions: document.getElementById('autoAllowQuestions').checked, frame };
}

// Ket qua AI (van ban) -> kiem tra/ghep vao slot cua mau -> blocks xem truoc.
async function frameResultToPreview(frame, rawText) {
  const res = await fetch('/api/template-prompts/prepare', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template: frame, rawText, promptGroup: 'FULL_EXAM' }) });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  const draft = data.draft;
  if (!draft.assignments.length) {
    throw new Error(`AI trả sai cú pháp của mẫu, không ghép được câu nào. ${draft.issues.slice(0, 3).map(x => x.human_readable_message).join(' ')}`);
  }
  const bySlot = new Map(draft.assignments.map(a => [a.slot_id, a.after]));
  const blocks = templateToBlocks(frame, slot => bySlot.get(slot.slot_id) || null);
  return { blocks, notes: draft.issues.map(x => x.human_readable_message) };
}

// Ten de moi: lay o "Ten de" trong bang; trong thi "De kiem tra – <chu de>". Tranh
// de moi mang ten de cu con nam trong o tieu de cua trinh soan de.
function applyAutoGenTitle(topic) {
  const typed = document.getElementById('autoTitleInput').value.trim();
  document.getElementById('examTitleInput').value = typed || (topic ? `Đề kiểm tra – ${topic}` : 'Đề kiểm tra');
  const doc = cachedResources.find(d => d.doc_id === document.getElementById('autoDocSelect').value);
  if (doc?.subject) document.getElementById('examSubjectInput').value = doc.subject;
}

// Hop xac nhan trong bang (thay confirm() cua trinh duyet).
function askAutoGen(title, text, yesLabel = 'Có') {
  const dlg = document.getElementById('autoGenConfirm');
  document.getElementById('autoGenConfirmTitle').textContent = title;
  document.getElementById('autoGenConfirmText').textContent = text;
  document.getElementById('autoGenConfirmYes').textContent = yesLabel;
  return new Promise(resolve => {
    const done = value => { dlg.close(); yes.removeEventListener('click', onYes); no.removeEventListener('click', onNo); dlg.removeEventListener('cancel', onNo); resolve(value); };
    const yes = document.getElementById('autoGenConfirmYes');
    const no = document.getElementById('autoGenConfirmNo');
    const onYes = () => done(true);
    const onNo = e => { e?.preventDefault?.(); done(false); };
    yes.addEventListener('click', onYes);
    no.addEventListener('click', onNo);
    dlg.addEventListener('cancel', onNo);
    dlg.showModal();
  });
}

let autoGenJobId = null;
let autoGenLastRequest = null;
let autoGenPreviewBlocks = null;
let autoGenStopped = false;
function setAutoGenControls(mode) {
  // mode: 'running' | 'stopped' | 'idle'
  document.getElementById('autoGenControls').hidden = mode === 'idle';
  document.getElementById('autoGenStopBtn').hidden = mode !== 'running';
  document.getElementById('autoGenResumeBtn').hidden = mode !== 'stopped';
  document.getElementById('autoGenerateBtn').disabled = mode === 'running';
}
function markAutoGenFailed(message) {
  document.getElementById('autoGenStage').textContent = message;
  document.querySelectorAll('#autoGenSteps li.active').forEach(li => { li.classList.remove('active'); li.classList.add('failed'); });
}
function resetAutoGenBoard() {
  autoGenJobId = null;
  autoGenPending = null;
  autoGenPreviewBlocks = null;
  autoGenStopped = false;
  document.getElementById('autoGenProgress').hidden = true;
  document.getElementById('autoGenQA').hidden = true;
  document.getElementById('autoGenPreview').hidden = true;
  document.getElementById('autoGenPreviewPaper').replaceChildren();
  autoGenError('');
  autoGenResultEl.textContent = '';
  document.getElementById('autoGenerateStatus').textContent = '';
  setAutoGenControls('idle');
}
function describeContext(info) {
  if (!info || !info.sections) return 'Không dùng tài liệu tham khảo.';
  const kb = n => `${n < 1000 ? n : (n / 1000).toFixed(1) + 'k'} ký tự`;
  return info.mode === 'full'
    ? `AI đã đọc toàn bộ ${info.sections} phần tài liệu (${kb(info.used_chars)}).`
    : `Tài liệu dài ${kb(info.total_chars)}: AI đọc ${info.used_chunks}/${info.total_chunks} đoạn liên quan nhất (${kb(info.used_chars)}).`;
}
function previewTitle(topic) {
  const typed = document.getElementById('autoTitleInput').value.trim();
  return typed || (topic ? `Đề kiểm tra – ${topic}` : 'Đề kiểm tra');
}
// Ve de vua sinh vao bang de xem truoc; CHUA dua vao trinh soan de / Lich su
// cho toi khi bam "Luu de". Sua tren ban xem truoc (xoa cau, danh dau dap an)
// duoc giu khi luu.
function showAutoGenPreview(data, requestBody) {
  autoGenPreviewBlocks = structuredClone(data.blocks);
  ensureIds(autoGenPreviewBlocks);
  const count = autoGenPreviewBlocks.reduce((n, blk) => n + blk.questions.length, 0);
  const title = previewTitle(requestBody.topic);
  document.getElementById('autoGenPreviewTitle').textContent = `Xem trước: ${title} (${count} câu)`;
  const warn = (data.spec_warnings?.length ? ` ⚠️ AI chưa khớp bảng: ${data.spec_warnings.join('; ')}.` : '')
    + (data.frame_notes?.length ? ` ⚠️ Lưu ý khi ghép vào mẫu (${data.frame_notes.length}): ${data.frame_notes.slice(0, 4).join(' ')}${data.frame_notes.length > 4 ? ' …' : ''}` : '')
    + (requestBody.frame ? ` 📐 Mẫu: ${requestBody.frame.display_name}.` : '');
  document.getElementById('autoGenPreviewInfo').textContent = `${describeContext(data.context_info)}${warn} Kiểm tra đề, ổn thì bấm "Lưu đề" để đưa vào trình soạn đề và Lịch sử.`;
  const paper = document.getElementById('autoGenPreviewPaper');
  const meta = { title, subject: document.getElementById('examSubjectInput').value.trim(), duration_minutes: parseInt(document.getElementById('examDurationInput').value, 10) || null, school_header: document.getElementById('examSchoolInput').value.trim() };
  const rerender = () => { paper.replaceChildren(); renderExamInto(paper, meta, { blocks: autoGenPreviewBlocks, rerender }); };
  rerender();
  document.getElementById('autoGenPreview').hidden = false;
  document.getElementById('autoGenerateStatus').textContent = `📝 Đề "${title}" (${count} câu) đang chờ lưu — mở bảng sinh đề để xem và bấm Lưu.`;
  document.getElementById('autoGenPreview').scrollIntoView({ block: 'start', behavior: 'smooth' });
}

async function runAutoGenJob(requestBody) {
  const statusEl = document.getElementById('autoGenerateStatus');
  autoGenRunning = true;
  autoGenStopped = false;
  autoGenLastRequest = requestBody;
  autoGenError('');
  autoGenResultEl.textContent = '';
  document.getElementById('autoGenQA').hidden = true;
  document.getElementById('autoGenPreview').hidden = true;
  setAutoGenControls('running');
  renderAutoGenProgress({ stage: 'queued', message: 'Đang bắt đầu...', elapsed_ms: 0 });
  statusEl.textContent = '⏳ Đang sinh đề... (bảng sinh đề có thể đóng, đề vẫn tiếp tục sinh)';
  try {
    const { frame, ...body } = requestBody;
    const start = await fetch('/api/generate/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const startData = await start.json();
    if (!startData.success) throw new Error(startData.error || `HTTP ${start.status}`);
    autoGenJobId = startData.job_id;
    let job;
    for (;;) {
      await new Promise(r => setTimeout(r, 700));
      if (autoGenJobId !== startData.job_id) return; // da huy/bat dau lai
      const res = await fetch(`/api/generate/jobs/${startData.job_id}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      job = data.job;
      if (job.state === 'done') break;
      renderAutoGenProgress(job);
    }
    autoGenJobId = null;
    const data = job.result || {};
    if (data.cancelled) {
      if (data.mode === 'stop') {
        autoGenStopped = true;
        setAutoGenControls('stopped');
        document.getElementById('autoGenResumeBtn').textContent = '▶ Tiếp tục';
        markAutoGenFailed('⏸ Đã dừng. Bấm "Tiếp tục" để sinh lại từ đầu với cùng yêu cầu, hoặc "Hủy" để bỏ toàn bộ.');
        statusEl.textContent = '⏸ Đã dừng sinh đề.';
      } else {
        resetAutoGenBoard();
        showCopyToast('✖ Đã hủy sinh đề.', 4000);
      }
      return;
    }
    if (!data.success) throw new Error(data.details ? `${data.error}: ${data.details}` : data.error);
    if (data.needs_input) {
      renderAutoGenProgress({ ...job, stage: 'checking', message: 'AI cần thêm thông tin từ bạn.' });
      autoGenPending = { requestBody, questions: data.questions };
      document.getElementById('autoGenQuestions').textContent = data.questions;
      document.getElementById('autoGenAnswer').value = '';
      document.getElementById('autoGenQA').hidden = false;
      setAutoGenControls('stopped');
      document.getElementById('autoGenResumeBtn').hidden = true;
      statusEl.textContent = '🤖 AI đang hỏi lại — mở bảng sinh đề để trả lời.';
      openAutoGenBoard();
      document.getElementById('autoGenAnswer').focus();
      return;
    }
    let previewData = data;
    if (frame) {
      const { blocks, notes } = await frameResultToPreview(frame, data.raw_text || '');
      previewData = { blocks, frame_notes: notes, context_info: data.context_info };
    }
    renderAutoGenProgress({ ...job, stage: 'done', message: 'Đã sinh đề — xem trước bên dưới.' });
    setAutoGenControls('idle');
    showAutoGenPreview(previewData, requestBody);
    openAutoGenBoard();
  } catch (err) {
    autoGenJobId = null;
    // Loi (vd hang AI qua tai 503): cho "Thu lai" cung yeu cau hoac "Huy".
    setAutoGenControls('stopped');
    document.getElementById('autoGenResumeBtn').textContent = '🔁 Thử lại';
    autoGenStopped = true;
    statusEl.textContent = '';
    markAutoGenFailed('❌ Sinh đề thất bại.');
    autoGenError('Lỗi sinh đề tự động: ' + err.message);
    openAutoGenBoard();
  } finally {
    autoGenRunning = false;
    if (!autoGenStopped && !autoGenPending) document.getElementById('autoGenerateBtn').disabled = false;
  }
}

document.getElementById('autoGenerateBtn').addEventListener('click', async () => {
  if (autoGenRunning) return;
  if (autoGenPreviewBlocks && !await askAutoGen('Sinh đề mới?', 'Đề đang xem trước chưa được lưu sẽ bị bỏ. Bạn có muốn sinh đề mới không?', 'Sinh đề mới')) return;
  const requestBody = await buildAutoGenRequest();
  if (!requestBody) return;
  autoGenPending = null;
  autoGenPreviewBlocks = null;
  runAutoGenJob(requestBody);
});
document.getElementById('autoGenStopBtn').addEventListener('click', async () => {
  if (!autoGenJobId) return;
  if (!await askAutoGen('Bạn có muốn dừng không?', 'AI sẽ ngừng ngay; yêu cầu và cài đặt được giữ để bấm "Tiếp tục" (sinh lại từ đầu). Phần token AI đã sinh trước khi dừng có thể vẫn bị hãng tính phí.', 'Dừng')) return;
  if (autoGenJobId) await fetch(`/api/generate/jobs/${autoGenJobId}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'stop' }) });
});
document.getElementById('autoGenCancelBtn').addEventListener('click', async () => {
  if (!await askAutoGen('Bạn có muốn hủy toàn bộ không?', 'Việc sinh đề, câu hỏi của AI và đề xem trước (nếu có) sẽ bị bỏ hết. Không thể hoàn tác.', 'Hủy toàn bộ')) return;
  const jobId = autoGenJobId;
  if (jobId) {
    autoGenJobId = null; // vong hoi trang thai tu thoat
    await fetch(`/api/generate/jobs/${jobId}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'cancel' }) }).catch(() => {});
  }
  resetAutoGenBoard();
  showCopyToast('✖ Đã hủy toàn bộ việc sinh đề.', 4000);
});
document.getElementById('autoGenResumeBtn').addEventListener('click', () => {
  if (autoGenRunning || !autoGenLastRequest) return;
  runAutoGenJob(autoGenLastRequest);
});
document.getElementById('autoGenSaveBtn').addEventListener('click', () => {
  if (!autoGenPreviewBlocks) return;
  const blocks = autoGenPreviewBlocks;
  applyAutoGenTitle(autoGenLastRequest?.topic);
  const frame = autoGenLastRequest?.frame;
  if (frame) {
    if (!document.getElementById('examDurationInput').value && frame.defaults?.duration_minutes) {
      document.getElementById('examDurationInput').value = frame.defaults.duration_minutes;
    }
    // De theo mau: giu thu tu A-D (muon xao thi bam nut Xao), gan mau de xuat Word theo mau.
    applyGeneratedBlocks(blocks, { shuffle: false });
    state.template_binding = templateBinding(frame);
    scheduleArchiveSave({ immediate: true });
  } else {
    applyGeneratedBlocks(blocks); // dua vao trinh soan de va luu ngay vao Lich su
  }
  const count = blocks.reduce((n, blk) => n + blk.questions.length, 0);
  const title = document.getElementById('examTitleInput').value;
  resetAutoGenBoard();
  document.getElementById('autoGenerateStatus').textContent = `✅ Đã lưu đề "${title}" (${count} câu).`;
  showCopyToast(`💾 Đã lưu đề "${title}" (${count} câu) vào trình soạn đề và Lịch sử.`, 5000);
  autoGenDialog.close();
});
document.getElementById('autoGenRegenBtn').addEventListener('click', async () => {
  if (autoGenRunning || !autoGenLastRequest) return;
  if (!await askAutoGen('Sinh lại đề?', 'Đề đang xem trước sẽ bị bỏ và AI sinh đề mới với cùng yêu cầu (tốn thêm một lượt gọi API).', 'Sinh lại')) return;
  autoGenPreviewBlocks = null;
  runAutoGenJob(autoGenLastRequest);
});
function continueAfterQuestions(answer) {
  if (!autoGenPending || autoGenRunning) return;
  const { requestBody, questions } = autoGenPending;
  const clarifications = [...(requestBody.clarifications || []), { question: questions, answer }];
  autoGenPending = null;
  runAutoGenJob({ ...requestBody, clarifications });
}
document.getElementById('autoGenSendAnswer').addEventListener('click', () => {
  const answer = document.getElementById('autoGenAnswer').value.trim();
  if (!answer) { autoGenError('Hãy nhập câu trả lời cho AI, hoặc bấm "Bỏ qua, cứ ra đề".'); return; }
  continueAfterQuestions(answer);
});
document.getElementById('autoGenSkipAnswer').addEventListener('click', () => {
  continueAfterQuestions('Không có thêm thông tin. Hãy tự chọn phương án hợp lý nhất và ra đề ngay, không hỏi thêm.');
});
document.getElementById('autoGenDiscardBtn').addEventListener('click', async () => {
  if (!await askAutoGen('Bỏ đề này?', 'Đề vừa sinh chưa được lưu sẽ bị xóa khỏi bảng.', 'Bỏ đề')) return;
  resetAutoGenBoard();
});

loadModels();
loadLiveCloudModels();
loadResources();
loadFrames();

// ---------- Load exam from share link on page load ----------
function loadExamIntoState(exam) {
  state.title = exam.title;
  state.subject = exam.subject;
  state.duration_minutes = exam.duration_minutes;
  state.school_header = exam.school_header;
  state.blocks = exam.blocks;
  ensureIds(state.blocks);
  normalizeExamMath(state.blocks); // TASK E: nang cap cong thuc toan de cu -> $...$
  state.isStudentMode = true;

  document.getElementById('examTitleInput').value = state.title || '';
  document.getElementById('examSubjectInput').value = state.subject || '';
  document.getElementById('examDurationInput').value = state.duration_minutes || '';
  document.getElementById('examSchoolInput').value = state.school_header || '';
  document.getElementById('studentModeToggle').checked = true;
  document.getElementById('appMain').classList.add('shared-view');

  renderExam();
  toggleActionButtons(true);
}

(async function initFromShareLink() {
  const params = new URLSearchParams(location.search);
  const dataParam = params.get('data');
  const codeParam = params.get('code');

  if (dataParam) {
    try {
      const json = decodeURIComponent(escape(atob(decodeURIComponent(dataParam))));
      loadExamIntoState(JSON.parse(json));
    } catch (err) {
      showError('Link chia sẻ không hợp lệ.');
    }
  } else if (codeParam) {
    try {
      const res = await fetch(`/api/exams/shared/${codeParam}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      loadExamIntoState(data.exam);
    } catch (err) {
      showError('Không thể tải đề thi chia sẻ: ' + err.message);
    }
  }
})();

// ============================================================
//  Kho de (lich su luu tru) + Dong bo GitHub Gist
// ============================================================

const ARCHIVE_SAVE_DEBOUNCE_MS = 1500;
let archiveSaveTimer = null;
let archiveSaveInFlight = false;
let archiveSaveQueued = false;
let archivePending = null;
let archiveLocalRevision = 0;
let storageWarningShown = false;
const archiveOutbox = createArchiveOutbox({
  // Access localStorage inside these methods: some browser modes throw on access.
  storage: {
    setItem: (...args) => localStorage.setItem(...args),
    getItem: key => localStorage.getItem(key), removeItem: key => localStorage.removeItem(key),
    key: i => localStorage.key(i), get length() { return localStorage.length; }
  },
  fetch: (...args) => fetch(...args), uuid: () => crypto.randomUUID(),
  beacon: (...args) => navigator.sendBeacon?.(...args),
  onStorageError: () => {
    if (storageWarningShown) return;
    storageWarningShown = true;
    showCopyToast('Trình duyệt không lưu được bản nháp dự phòng. Hãy bấm Lưu đề trước khi đóng.', 7000);
  }
});

function stageArchiveSave() {
  archiveLocalRevision++;
  // One stable ID even if a beacon races the first ordinary save.
  if (!state.archiveId) state.archiveId = crypto.randomUUID();
  archivePending = archiveOutbox.stage({ ...buildExamPayload(), exam_id: state.archiveId });
  return archivePending;
}

// Khong tu luu khi dang xem de qua link chia se (che do nguoi nhan) hoac khi
// chua co de nao.
function canAutosaveArchive() {
  return state.blocks.length > 0 && !document.getElementById('appMain').classList.contains('shared-view');
}

function scheduleArchiveSave(opts = {}) {
  if (!canAutosaveArchive()) return;
  stageArchiveSave();
  clearTimeout(archiveSaveTimer);
  if (opts.immediate) {
    archiveSaveTimer = null;
    doArchiveSave();
  } else {
    archiveSaveTimer = setTimeout(() => { archiveSaveTimer = null; doArchiveSave(); }, ARCHIVE_SAVE_DEBOUNCE_MS);
  }
}

async function doArchiveSave() {
  if (!canAutosaveArchive()) return false;
  if (archiveSaveInFlight) { archiveSaveQueued = true; return false; }
  archiveSaveInFlight = true;
  let saved = false;
  const entry = archivePending || stageArchiveSave();
  try {
    await archiveOutbox.save(entry);
    if (archivePending === entry) archivePending = null;
    saved = true;
  } catch (err) {
    // Luu kho la tinh nang nen - loi mang khong duoc chan luong soan de.
    state.lastArchiveError = err.message;
  } finally {
    archiveSaveInFlight = false;
    if (archiveSaveQueued) { archiveSaveQueued = false; scheduleArchiveSave(); }
  }
  return saved;
}

// Luu ngay (nut "Luu de" / "Ap nen"): cho lan luu dang chay xong roi luu lai
// de chac chan ban moi nhat da vao kho.
async function saveExamNow() {
  if (!canAutosaveArchive()) { showCopyToast('Chưa có đề nào để lưu.', 5000); return false; }
  clearTimeout(archiveSaveTimer);
  archiveSaveTimer = null;
  while (archiveSaveInFlight) await new Promise(r => setTimeout(r, 100));
  archiveSaveQueued = false;
  stageArchiveSave();
  const ok = await doArchiveSave();
  showCopyToast(ok ? `💾 Đã lưu đề "${state.title || 'Đề kiểm tra'}" vào Lịch sử.` : `Không lưu được đề: ${state.lastArchiveError || 'lỗi không rõ'}`, 5000);
  return ok;
}

document.getElementById('saveExamBtn').addEventListener('click', saveExamNow);
document.getElementById('bgApplyToExamBtn').addEventListener('click', async () => {
  if (!state.blocks.length) { showCopyToast('Hãy sinh hoặc mở một đề trước khi áp nền.', 5000); return; }
  const { enabled, file, opacity, fit } = state.background;
  if (enabled && !file) { showCopyToast('Chọn ảnh nền trước khi áp.', 5000); return; }
  state.examBackground = enabled ? { file, opacity, fit } : null;
  updateExamBackgroundStatus();
  if (await saveExamNow()) {
    showCopyToast(state.examBackground ? '📌 Đã áp nền vào đề đang mở và lưu. Mở lại đề từ Lịch sử sẽ có sẵn nền.' : 'Đã gỡ nền khỏi đề đang mở và lưu.', 5000);
  }
});

function flushArchiveSaveOnUnload() {
  clearTimeout(archiveSaveTimer);
  archiveSaveTimer = null;
  if (canAutosaveArchive() && archivePending && !archiveOutbox.flushOnHide(archivePending)) {
    // Large exams use a normal save while the hidden page is still alive;
    // the persistent draft covers termination before that request completes.
    doArchiveSave();
  }
  // Sending only a small signal leaves room for the final archive beacon.
  // The server retries failed uploads even after this tab has gone away.
  const body = JSON.stringify({ theme: { id: currentTheme(), updated_at: currentThemeAt() } });
  try {
    if (navigator.sendBeacon?.('/api/sync/auto-push', new Blob([body], { type: 'application/json' }))) return;
  } catch { /* Try keepalive if the browser rejected the beacon. */ }
  fetch('/api/sync/auto-push', { method: 'POST', keepalive: true,
    headers: { 'Content-Type': 'application/json' }, body }).catch(() => {});
}
window.addEventListener('pagehide', flushArchiveSaveOnUnload);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushArchiveSaveOnUnload();
});

// Autosave khi sua truc tiep tren ban xem truoc: content/option/explanation/
// dap an dien tu bubble qua 'input'; select Dung-Sai va so dong nhap qua 'change'.
examContainerEl.addEventListener('input', () => scheduleArchiveSave());
examContainerEl.addEventListener('change', () => scheduleArchiveSave());

// Sua meta de thi (tieu de / mon / thoi gian / truong) sau khi da sinh de:
// dong bo vao state + luu kho.
['examTitleInput', 'examSubjectInput', 'examDurationInput', 'examSchoolInput'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    if (!state.blocks.length) return;
    state.title = document.getElementById('examTitleInput').value.trim() || 'Đề kiểm tra';
    state.subject = document.getElementById('examSubjectInput').value.trim();
    state.duration_minutes = parseInt(document.getElementById('examDurationInput').value, 10) || null;
    state.school_header = document.getElementById('examSchoolInput').value.trim();
    renderExam();
    scheduleArchiveSave();
  });
});

// ---------- Modal Lich su ----------
const libraryModal = document.getElementById('libraryModal');
const libraryExamListEl = document.getElementById('libraryExamList');
const libraryEmptyHintEl = document.getElementById('libraryEmptyHint');
const syncDetails = document.getElementById('syncDetails');

function formatDateShort(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

document.getElementById('libraryBtn').addEventListener('click', async () => {
  libraryModal.classList.add('open');
  // Uu tien danh sach de: khu dong bo gap lai, chi mo san neu da cau hinh token.
  syncDetails.open = false;
  changeTokenPanel.classList.add('form-hidden');
  changeGistPanel.classList.add('form-hidden');
  loadArchiveList();
  await loadSyncSettings();
  if (syncHasToken) syncDetails.open = true;
});
document.getElementById('closeLibraryModalBtn').addEventListener('click', () => {
  libraryModal.classList.remove('open');
});

async function loadArchiveList() {
  const archiveIdAtRequest = state.archiveId;
  const localRevisionAtRequest = archiveLocalRevision;
  const savePendingAtRequest = !!archivePending || archiveSaveInFlight;
  let exams = [];
  let loaded = false;
  try {
    const res = await fetch('/api/archive');
    const data = await res.json();
    exams = data.success ? data.exams : [];
    loaded = data.success && Array.isArray(data.exams);
  } catch {
    exams = [];
  }

  // De dang mo khong con trong danh sach (bi xoa cuc bo, hoac keo ve thanh
  // tombstone) -> bo lien ket archiveId de lan sua sau tao ban ghi moi thay vi
  // cap nhat ban ghi da xoa.
  if (loaded && state.archiveId && state.archiveId === archiveIdAtRequest && !savePendingAtRequest &&
      archiveLocalRevision === localRevisionAtRequest && !exams.some(e => e.exam_id === state.archiveId)) {
    state.archiveId = null;
  }

  libraryExamListEl.innerHTML = '';
  libraryEmptyHintEl.style.display = exams.length ? 'none' : '';

  exams.forEach(ex => {
    const li = document.createElement('li');
    li.className = 'form-question-item';

    const info = document.createElement('div');
    info.className = 'form-question-item-info';
    const sub = [
      ex.subject,
      ex.duration_minutes ? `${ex.duration_minutes} phút` : '',
      `Sửa: ${formatDateShort(ex.updated_at)}`
    ].filter(Boolean).join(' · ');
    info.innerHTML = `<strong>${escapeHtml(ex.title || 'Đề chưa đặt tên')}</strong><span>${escapeHtml(sub)}</span>`;

    const actions = document.createElement('div');
    actions.className = 'form-question-item-actions';

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'edit-btn';
    openBtn.textContent = 'Mở';
    openBtn.addEventListener('click', () => openArchivedExam(ex.exam_id));

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'delete-btn';
    delBtn.textContent = 'Xóa';
    delBtn.addEventListener('click', () => deleteArchivedExam(ex));

    actions.appendChild(openBtn);
    actions.appendChild(delBtn);
    li.appendChild(info);
    li.appendChild(actions);
    libraryExamListEl.appendChild(li);
  });
}

async function openArchivedExam(examId) {
  try {
    const res = await fetch(`/api/archive/${examId}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    loadArchivedExamIntoState(data.exam);
    libraryModal.classList.remove('open');
  } catch (err) {
    showError('Không mở được đề từ kho: ' + err.message);
  }
}

function loadArchivedExamIntoState(exam) {
  state.title = exam.title || '';
  state.subject = exam.subject || '';
  state.duration_minutes = exam.duration_minutes || null;
  state.school_header = exam.school_header || '';
  state.blocks = Array.isArray(exam.blocks) ? exam.blocks : [];
  state.template_binding = exam.template_binding || null;
  ensureIds(state.blocks);
  normalizeExamMath(state.blocks); // TASK E: nang cap cong thuc toan de cu -> $...$
  restoreExamBackground(exam.background);
  state.archiveId = exam.exam_id;
  state.examId = null;
  state.activeShareCode = null;
  lastGenerateSaveAt = 0; // bam "Sinh De" sau khi mo de cu -> tao ban ghi moi

  document.getElementById('examTitleInput').value = state.title;
  document.getElementById('examSubjectInput').value = state.subject;
  document.getElementById('examDurationInput').value = state.duration_minutes || '';
  document.getElementById('examSchoolInput').value = state.school_header;

  clearExamVersions();
  renderExam();
  toggleActionButtons(true);
  document.getElementById('generateMultiCodeBtn').disabled = false;
  hideError();
  warnBrokenMath(state.blocks);
}

async function deleteArchivedExam(ex) {
  const ok = window.confirm(
    `Xóa đề "${ex.title || 'Đề chưa đặt tên'}"?\n\n` +
    `Nếu bật tự đẩy và có token chủ kho, thay đổi này cũng được đưa lên Gist.\n` +
    `Các thiết bị khác nhận thay đổi khi kéo kho đề về.`
  );
  if (!ok) return;
  try {
    const res = await fetch(`/api/archive/${ex.exam_id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    if (state.archiveId === ex.exam_id) state.archiveId = null;
    loadArchiveList();
  } catch (err) {
    showError('Lỗi xóa đề khỏi kho: ' + err.message);
  }
}

// ---------- Dong bo Gist ----------
// Token va Gist ID mac dinh "khoa" - chi hien nhan trang thai. Muon doi phai
// bam "Thay doi Token" / "Thay doi Gist ID" de mo panel tuong ung.
const syncStatusEl = document.getElementById('syncStatus');
const syncMetaEl = document.getElementById('syncMeta');
const ghTokenInput = document.getElementById('ghTokenInput');
const gistIdInput = document.getElementById('gistIdInput');
const tokenStateLabel = document.getElementById('tokenStateLabel');
const gistStateLabel = document.getElementById('gistStateLabel');
const changeTokenPanel = document.getElementById('changeTokenPanel');
const changeGistPanel = document.getElementById('changeGistPanel');
const createGistBtn = document.getElementById('createGistBtn');
const syncPushBtn = document.getElementById('syncPushBtn');
const syncPullBtn = document.getElementById('syncPullBtn');
const autoPullOnOpenInput = document.getElementById('autoPullOnOpen');
const autoPushOnCloseInput = document.getElementById('autoPushOnClose');

let syncHasToken = false;
let syncGistId = '';
let syncDefaultGistId = '';
let syncSharedOwner = '';
let syncIsShared = false;
let syncInFlight = false;
let autoPullEnabled = true;
try { autoPullEnabled = localStorage.getItem('exambuilder-auto-pull') !== 'false'; } catch { /* mac dinh bat */ }
autoPullOnOpenInput.checked = autoPullEnabled;

function setSyncStatus(msg, kind) {
  syncStatusEl.textContent = msg || '';
  syncStatusEl.classList.toggle('is-error', kind === 'error');
  syncStatusEl.classList.toggle('is-ok', kind === 'ok');
}

function renderSyncState() {
  const masked = tokenStateLabel.dataset.masked;
  tokenStateLabel.textContent = syncHasToken
    ? (masked ? `✅ Đã lưu (${masked})` : '✅ Đã lưu')
    : (syncIsShared ? 'Không cần để kéo kho chung' : 'Chưa có — chỉ cần khi đẩy lên');
  tokenStateLabel.classList.toggle('is-set', syncHasToken);
  gistStateLabel.textContent = syncGistId ? `✅ ${syncGistId}` : '⚠️ Chưa có';
  gistStateLabel.classList.toggle('is-set', !!syncGistId);
  // "Tạo Gist ID mới" cần token trước.
  createGistBtn.disabled = !syncHasToken || syncInFlight;
  syncPushBtn.disabled = !syncHasToken || syncInFlight;
  syncPullBtn.disabled = !syncGistId || syncInFlight;
  syncPushBtn.textContent = syncIsShared ? '⬆️ Chủ kho đẩy lên' : '⬆️ Đẩy lên (Push)';
  document.getElementById('syncDescription').textContent = syncIsShared
    ? `Tự nhận kho đề chung, không cần token. Chỉ chủ kho ${syncSharedOwner} cần token để đẩy thay đổi lên.`
    : 'Kho riêng: kéo về không cần token; đẩy lên cần token của chủ Gist.';
}

async function loadSyncSettings() {
  try {
    const res = await fetch('/api/sync/settings');
    const data = await res.json();
    if (!data.success) return;
    syncHasToken = !!data.has_token;
    syncGistId = data.gist_id || '';
    syncDefaultGistId = data.default_gist_id || '';
    syncSharedOwner = data.shared_gist_owner || '';
    syncIsShared = !!data.is_shared;
    autoPushOnCloseInput.checked = data.auto_push?.enabled !== false;
    const auto = data.auto_push || {};
    document.getElementById('autoPushStatus').textContent = !auto.enabled
      ? 'Tự đẩy đang tắt. Bạn vẫn có thể đẩy thủ công.'
      : !data.has_token ? 'Đang dùng chế độ đọc. Muốn tự đẩy, hãy lưu token của chủ kho.'
      : auto.last_error ? `Chưa đẩy được: ${auto.last_error}. Đề vẫn được giữ trên máy.`
      : auto.pending ? 'Có thay đổi đang chờ đẩy lên Gist.'
      : auto.last_pushed_at ? `Đã tự lưu lên Gist: ${formatDateShort(auto.last_pushed_at)}`
      : 'Tự đẩy khi đóng web; cũng lưu lên Gist sau khi sửa đề. Mất mạng sẽ thử lại.';
    if (data.has_token && data.masked_token) tokenStateLabel.dataset.masked = data.masked_token;
    renderSyncState();
    syncMetaEl.textContent = data.last_synced_at
      ? `Đồng bộ lần cuối: ${formatDateShort(data.last_synced_at)}`
      : 'Chưa đồng bộ lần nào.';
    return data;
  } catch {
    // giu nguyen trang thai hien tai
    return null;
  }
}

async function postSyncSettings(body) {
  const res = await fetch('/api/sync/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Lỗi lưu cấu hình');
  return data;
}

// --- Panel: thay đổi Token ---
document.getElementById('changeTokenBtn').addEventListener('click', () => {
  ghTokenInput.value = '';
  changeTokenPanel.classList.remove('form-hidden');
  changeGistPanel.classList.add('form-hidden');
  ghTokenInput.focus();
});
document.getElementById('cancelTokenBtn').addEventListener('click', () => {
  changeTokenPanel.classList.add('form-hidden');
  ghTokenInput.value = '';
});
document.getElementById('saveTokenBtn').addEventListener('click', async () => {
  const token = ghTokenInput.value.trim();
  if (!token) { setSyncStatus('❌ Chưa nhập Token.', 'error'); return; }
  try {
    await postSyncSettings({ github_token: token });
    ghTokenInput.value = '';
    changeTokenPanel.classList.add('form-hidden');
    await loadSyncSettings();
    setSyncStatus('✅ Đã lưu Token.', 'ok');
  } catch (err) {
    setSyncStatus('❌ ' + err.message, 'error');
  }
});

// --- Panel: thay đổi Gist ID ---
document.getElementById('changeGistBtn').addEventListener('click', () => {
  gistIdInput.value = syncGistId;
  changeGistPanel.classList.remove('form-hidden');
  changeTokenPanel.classList.add('form-hidden');
});
document.getElementById('cancelGistBtn').addEventListener('click', () => {
  changeGistPanel.classList.add('form-hidden');
});
document.getElementById('saveGistIdBtn').addEventListener('click', async () => {
  const gistId = gistIdInput.value.trim();
  if (!gistId) { setSyncStatus('❌ Chưa nhập Gist ID.', 'error'); return; }
  try {
    await postSyncSettings({ gist_id: gistId });
    changeGistPanel.classList.add('form-hidden');
    await loadSyncSettings();
    setSyncStatus('✅ Đã lưu Gist ID. Bấm "Kéo về" để đồng bộ.', 'ok');
  } catch (err) {
    setSyncStatus('❌ ' + err.message, 'error');
  }
});

// "Tạo Gist ID mới": xoá gist_id hiện tại rồi Push -> backend tự tạo Gist mới.
createGistBtn.addEventListener('click', async () => {
  if (!syncHasToken) { setSyncStatus('❌ Cần lưu Token trước khi tạo Gist.', 'error'); return; }
  if (syncGistId && !window.confirm(
    'Tạo Gist MỚI sẽ ngừng dùng Gist hiện tại (Gist cũ vẫn còn trên GitHub, bạn tự xoá nếu muốn).\n\nTiếp tục?'
  )) return;
  createGistBtn.disabled = true;
  setSyncStatus('⏳ Đang tạo Gist mới và đẩy kho đề lên...', '');
  try {
    await postSyncSettings({ gist_id: '' });
    await runSync('push');
    changeGistPanel.classList.add('form-hidden');
  } catch (err) {
    setSyncStatus('❌ ' + err.message, 'error');
  } finally {
    renderSyncState();
  }
});

async function runSync(direction, { automatic = false } = {}) {
  if (syncInFlight) return false;
  syncInFlight = true;
  renderSyncState();
  setSyncStatus(direction === 'pull'
    ? (automatic ? '⏳ Đang tự động kéo kho đề về...' : '⏳ Đang kéo về từ Gist...')
    : '⏳ Đang đẩy lên Gist...', '');
  try {
    const res = await fetch(`/api/sync/${direction}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: { id: currentTheme(), updated_at: currentThemeAt() } })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    const r = data.result || {};
    const tail = r.tombstones ? `, ${r.tombstones} đã xóa` : '';
    const themeChanged = adoptSyncedTheme(data.theme);
    const themeTail = themeChanged ? ` • chủ đề: ${currentTheme()}` : '';
    setSyncStatus(
      `✅ ${direction === 'pull' ? 'Đã kéo về' : 'Đã đẩy lên'}: ${r.active || 0} đề đang lưu${tail}${themeTail}.`,
      'ok'
    );
    await loadArchiveList();
    await loadSyncSettings();
    return true;
  } catch (err) {
    setSyncStatus('❌ ' + err.message, 'error');
    return false;
  } finally {
    syncInFlight = false;
    renderSyncState();
  }
}

syncPullBtn.addEventListener('click', () => runSync('pull'));
syncPushBtn.addEventListener('click', () => runSync('push'));

const requestAutoPull = createAutoPull({
  loadSettings: loadSyncSettings,
  pull: () => runSync('pull', { automatic: true }),
  isEnabled: () => autoPullEnabled,
  isOnline: () => navigator.onLine !== false,
  isBusy: () => syncInFlight
});

autoPullOnOpenInput.addEventListener('change', () => {
  autoPullEnabled = autoPullOnOpenInput.checked;
  try { localStorage.setItem('exambuilder-auto-pull', String(autoPullEnabled)); } catch { /* chi luu trong phien */ }
  if (autoPullEnabled) requestAutoPull({ force: true }).catch(() => {});
});
autoPushOnCloseInput.addEventListener('change', async () => {
  try {
    await postSyncSettings({ auto_push_enabled: autoPushOnCloseInput.checked });
    await loadSyncSettings();
  } catch (err) {
    autoPushOnCloseInput.checked = !autoPushOnCloseInput.checked;
    setSyncStatus('❌ ' + err.message, 'error');
  }
});
document.getElementById('useSharedGistBtn').addEventListener('click', async () => {
  try {
    if (!syncDefaultGistId) await loadSyncSettings();
    if (!syncDefaultGistId) throw new Error('Chưa đọc được cấu hình kho chung.');
    await postSyncSettings({ gist_id: syncDefaultGistId });
    changeGistPanel.classList.add('form-hidden');
    await loadSyncSettings();
    if (autoPullEnabled) await requestAutoPull({ force: true });
  } catch (err) { setSyncStatus('❌ ' + err.message, 'error'); }
});
let archiveRecovery = null;
function recoverArchiveDrafts() {
  if (!archiveRecovery) archiveRecovery = archiveOutbox.recover().then(ids => {
    if (ids.length) showCopyToast(`Đã khôi phục ${ids.length} bản đề chưa lưu vào Lịch sử.`, 6000);
  }).finally(() => { archiveRecovery = null; });
  return archiveRecovery;
}
async function resumeWebSync() {
  await recoverArchiveDrafts();
  // Wake an offline outbox immediately on reconnect instead of waiting for backoff.
  await fetch('/api/sync/auto-push', { method: 'POST' });
  await requestAutoPull();
}
window.addEventListener('online', () => resumeWebSync().catch(() => {}));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') resumeWebSync().catch(() => {});
});
resumeWebSync().catch(() => {});
