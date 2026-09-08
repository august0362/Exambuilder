import { TextPromptParser } from '/parser/TextPromptParser.js';
import { FileUploadParser } from '/parser/FileUploadParser.js';
import { formatMathSymbols, latexToPlainText } from '/parser/mathFormat.js';
import { generateExamCodes, shuffleAllMCQOptions } from '/parser/examCodeGenerator.js';
import { EXAM_PROMPT_TEMPLATE, EXAM_PROMPT_EXAMPLE } from './promptTemplate.js';

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
  background: { enabled: false, file: '', opacity: 0.3 }
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
  } else {
    examPrintBgEl.style.backgroundImage = '';
  }
}

async function loadBackgroundList() {
  try {
    const res = await fetch('/api/backgrounds');
    const files = res.ok ? await res.json() : [];
    bgSelect.innerHTML = '<option value="">— Chọn ảnh nền —</option>' +
      files.map(f => `<option value="${f}">${f}</option>`).join('');
    if (files.length && !state.background.file) {
      state.background.file = files[0];
      bgSelect.value = files[0];
    }
  } catch {
    // Khong co nen PDF nao kha dung - giu dropdown rong, khong chan luong chinh.
  }
}
loadBackgroundList();

bgEnableToggle.addEventListener('change', () => {
  state.background.enabled = bgEnableToggle.checked;
  bgSelect.disabled = !bgEnableToggle.checked;
  bgOpacityRange.disabled = !bgEnableToggle.checked;
  applyBackgroundToPrintLayer();
});
bgSelect.addEventListener('change', () => {
  state.background.file = bgSelect.value;
  applyBackgroundToPrintLayer();
});
bgOpacityRange.addEventListener('input', () => {
  const pct = parseInt(bgOpacityRange.value, 10);
  state.background.opacity = pct / 100;
  bgOpacityValue.textContent = `${pct}%`;
  applyBackgroundToPrintLayer();
});

// ---------- Prompt reference section (Task 2) ----------
document.getElementById('promptText').textContent = EXAM_PROMPT_TEMPLATE;
document.getElementById('promptExampleText').textContent = EXAM_PROMPT_EXAMPLE;

let copyToastTimer = null;
function showCopyToast(msg) {
  const toast = document.getElementById('copyToast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(copyToastTimer);
  copyToastTimer = setTimeout(() => toast.classList.remove('show'), 2000);
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
  const ok = await copyTextToClipboard(EXAM_PROMPT_TEMPLATE);
  showCopyToast(ok ? '✅ Đã sao chép prompt vào clipboard!' : '❌ Không thể sao chép, hãy copy thủ công.');
});
document.getElementById('copyExampleBtn').addEventListener('click', async () => {
  const ok = await copyTextToClipboard(EXAM_PROMPT_EXAMPLE);
  showCopyToast(ok ? '✅ Đã sao chép ví dụ vào clipboard!' : '❌ Không thể sao chép, hãy copy thủ công.');
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
      blocks = await new FileUploadParser().parseFile(file);
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
function applyGeneratedBlocks(blocks) {
  ensureIds(blocks);
  shuffleAllMCQOptions(blocks);
  state.blocks = blocks;
  state.title = document.getElementById('examTitleInput').value.trim() || 'Đề kiểm tra';
  state.subject = document.getElementById('examSubjectInput').value.trim();
  state.duration_minutes = parseInt(document.getElementById('examDurationInput').value, 10) || null;
  state.school_header = document.getElementById('examSchoolInput').value.trim();
  state.examId = null;

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
    titleEl.textContent = block.block_title || (block.block_type === 'ESSAY' ? 'Phần Tự luận' : 'Phần Trắc nghiệm');
    blockEl.appendChild(titleEl);

    block.questions.forEach((q, qi) => {
      questionNo += 1;
      blockEl.appendChild(renderQuestionCard(q, bi, qi, ctx, questionNo));
    });

    container.appendChild(blockEl);
  });
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
  numberSpan.textContent = `Câu ${displayNo != null ? displayNo : qi + 1}: `;
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
  renderMathInline(contentEditable, q.content);
  contentEditable.contentEditable = String(!state.isStudentMode);
  contentEditable.addEventListener('focus', () => { contentEditable.textContent = q.content; });
  contentEditable.addEventListener('input', () => { q.content = contentEditable.textContent; });
  contentEditable.addEventListener('blur', () => {
    q.content = formatMathSymbols(contentEditable.textContent);
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
      q.explanation = formatMathSymbols(expl.textContent);
      renderExplanationInline(expl, q.explanation);
    });
    expl.addEventListener('input', () => { q.explanation = expl.textContent === expl.dataset.placeholder ? '' : expl.textContent; });
    card.appendChild(expl);
  }

  return card;
}

// Ve lời giải: moi cau (ket thuc bang dau cham + khoang trang) xuong 1 dong
// rieng cho de doc. Cac cum $...$ duoc che tam de dau "." ben trong cong thuc
// khong bi coi la het cau; so thap phan "3.14" / dau nhan ngam "α.cos" khong
// co khoang trang sau nen cung khong bi cat.
const EXPL_MATH_MASK = /\$\$[^$]+\$\$|\$[^$]*\$/g;
const EXPL_SENTENCE_SPLIT = /(?<=\.)\s+(?=\S)/;
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
  document.getElementById('shareBtn').disabled = !enabled;
  document.getElementById('exportPdfBtn').disabled = !enabled;
  document.getElementById('exportWordBtn').disabled = !enabled;
}

// ---------- Helpers ----------
function showError(msg) { errorMessageEl.textContent = msg; }
function hideError() { errorMessageEl.textContent = ''; }
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
    blocks: state.blocks
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
    children.push(new Paragraph({ text: block.block_title || '', heading: HeadingLevel.HEADING_2 }));

    block.questions.forEach((q) => {
      questionNo += 1;
      // latexToPlainText(): Word la text tinh, khong the render KaTeX nhu
      // tren man hinh - phai lam phang LaTeX ($...$) sang Unicode truoc khi
      // dua vao TextRun, tranh hien thi tho nguyen "$\sqrt{16}$" trong file.
      children.push(new Paragraph({
        children: [new TextRun({ text: `Câu ${questionNo}: `, bold: true }), new TextRun(latexToPlainText(q.content))]
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
        const explSentences = latexToPlainText(q.explanation).split(/(?<=\.)\s+(?=\S)/).map(s => s.trim()).filter(Boolean);
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
document.getElementById('exportWordBtn').addEventListener('click', () => {
  exportToWord().catch(err => showError('Lỗi xuất Word: ' + err.message));
});

// ---------- Share link ----------
async function generateShareLink() {
  const payload = buildExamPayload();
  const json = JSON.stringify(payload);
  const base64 = btoa(unescape(encodeURIComponent(json)));

  let url;
  let shareCode = null;
  if (base64.length < 1800) {
    url = `${location.origin}${location.pathname}?data=${encodeURIComponent(base64)}`;
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
      url = `${location.origin}${location.pathname}?code=${shareCode}`;
    } catch (err) {
      showError('Không thể tạo link chia sẻ qua máy chủ: ' + err.message);
      return;
    }
  }

  state.activeShareCode = shareCode;
  document.getElementById('shareLinkOutput').value = url;

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
let cachedResources = [];

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
  select.innerHTML = cachedModels.length
    ? cachedModels.map(m => `<option value="${m.model_id}">${escapeHtml(modelLabel(m))}</option>`).join('')
    : '<option value="">— Chưa có model, vào Cài đặt để thêm —</option>';
  if (cachedModels.some(m => m.model_id === prev)) select.value = prev;
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
    } catch (err) {
      showSettingsStatus('Lỗi lưu API key: ' + err.message);
    }
  });
});

document.getElementById('addCloudModelBtn').addEventListener('click', async () => {
  const provider = document.getElementById('newCloudModelProvider').value;
  const modelName = document.getElementById('newCloudModelName').value.trim();
  const displayName = document.getElementById('newCloudModelDisplay').value.trim() || modelName;
  if (!modelName) { showSettingsStatus('Vui lòng nhập tên model API.'); return; }
  try {
    const res = await fetch('/api/models/cloud', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: displayName, provider, model_name: modelName })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    document.getElementById('newCloudModelName').value = '';
    document.getElementById('newCloudModelDisplay').value = '';
    loadModels();
  } catch (err) {
    showSettingsStatus('Lỗi thêm model: ' + err.message);
  }
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
}

function renderSectionCheckboxes() {
  const wrap = document.getElementById('autoSectionCheckboxes');
  const docId = document.getElementById('autoDocSelect').value;
  const doc = cachedResources.find(d => d.doc_id === docId);
  if (!doc || !doc.sections.length) {
    wrap.innerHTML = '';
    return;
  }
  wrap.innerHTML = doc.sections.map(s => `
    <label class="section-checkbox-label">
      <input type="checkbox" value="${s.section_id}" checked />
      ${escapeHtml(s.section_title)}
    </label>
  `).join('');
}

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
  if (!title) { showError('Vui lòng nhập tên tài liệu.'); return; }
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
    loadResources();
  } catch (err) {
    showError('Lỗi tạo tài liệu: ' + err.message);
  }
});

function renderDocListForSections() {
  const wrap = document.getElementById('docListForSections');
  wrap.innerHTML = '';
  cachedResources.forEach(doc => {
    const box = document.createElement('div');
    box.className = 'doc-sections-box';

    const title = document.createElement('strong');
    title.textContent = `${doc.title}${doc.subject ? ' · ' + doc.subject : ''} (${doc.sections.length} phần)`;
    box.appendChild(title);

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
      if (!section_title || !content) { showError('Vui lòng nhập tên phần và nội dung.'); return; }
      try {
        const res = await fetch(`/api/resources/${doc.doc_id}/sections`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ section_title, content })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        loadResources();
      } catch (err) {
        showError('Lỗi thêm phần: ' + err.message);
      }
    });

    const delDocBtn = document.createElement('button');
    delDocBtn.type = 'button';
    delDocBtn.className = 'delete-btn';
    delDocBtn.textContent = 'Xóa tài liệu';
    delDocBtn.addEventListener('click', async () => {
      try {
        const res = await fetch(`/api/resources/${doc.doc_id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        loadResources();
      } catch (err) {
        showError('Lỗi xóa tài liệu: ' + err.message);
      }
    });

    box.appendChild(sectionTitleInput);
    box.appendChild(sectionContentInput);
    box.appendChild(addSectionBtn);
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

document.getElementById('autoGenerateBtn').addEventListener('click', async () => {
  hideError();
  const statusEl = document.getElementById('autoGenerateStatus');
  const btn = document.getElementById('autoGenerateBtn');

  const modelId = document.getElementById('autoModelSelect').value;
  if (!modelId) { showError('Vui lòng chọn 1 model trong Cài đặt trước.'); return; }

  const questionSpec = collectQuestionSpec();
  if (!questionSpec.length) { showError('Vui lòng nhập số lượng câu hỏi cho ít nhất 1 loại × mức độ.'); return; }

  const sectionIds = Array.from(document.querySelectorAll('#autoSectionCheckboxes input:checked')).map(i => i.value);
  const topic = document.getElementById('autoTopicInput').value.trim();

  btn.disabled = true;
  statusEl.textContent = 'Đang sinh đề... có thể mất vài chục giây tới vài phút, đặc biệt với model local.';

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_id: modelId, section_ids: sectionIds, topic, question_spec: questionSpec })
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.details ? `${data.error}: ${data.details}` : data.error);
    }
    applyGeneratedBlocks(data.blocks);
    statusEl.textContent = '✅ Đã sinh đề thành công.';
  } catch (err) {
    statusEl.textContent = '';
    showError('Lỗi sinh đề tự động: ' + err.message);
  } finally {
    btn.disabled = false;
  }
});

loadModels();
loadResources();

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

// Khong tu luu khi dang xem de qua link chia se (che do nguoi nhan) hoac khi
// chua co de nao.
function canAutosaveArchive() {
  return state.blocks.length > 0 && !document.getElementById('appMain').classList.contains('shared-view');
}

function scheduleArchiveSave(opts = {}) {
  if (!canAutosaveArchive()) return;
  clearTimeout(archiveSaveTimer);
  if (opts.immediate) {
    archiveSaveTimer = null;
    doArchiveSave();
  } else {
    archiveSaveTimer = setTimeout(() => { archiveSaveTimer = null; doArchiveSave(); }, ARCHIVE_SAVE_DEBOUNCE_MS);
  }
}

async function doArchiveSave() {
  if (!canAutosaveArchive()) return;
  if (archiveSaveInFlight) { archiveSaveQueued = true; return; }
  archiveSaveInFlight = true;
  try {
    const payload = buildExamPayload();
    if (state.archiveId) payload.exam_id = state.archiveId;
    const res = await fetch('/api/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success && data.exam_id) state.archiveId = data.exam_id;
  } catch {
    // Luu kho la tinh nang nen - loi mang khong duoc chan luong soan de.
  } finally {
    archiveSaveInFlight = false;
    if (archiveSaveQueued) { archiveSaveQueued = false; scheduleArchiveSave(); }
  }
}

function flushArchiveSaveOnUnload() {
  // Chi gui khi con thay doi chua luu (dang cho debounce). Neu khong co timer
  // treo thi lan luu gan nhat da bat het thay doi -> khong gui trung.
  if (!archiveSaveTimer && !archiveSaveQueued) return;
  clearTimeout(archiveSaveTimer);
  archiveSaveTimer = null;
  if (!canAutosaveArchive() || !navigator.sendBeacon) return;
  const payload = buildExamPayload();
  if (state.archiveId) payload.exam_id = state.archiveId;
  try {
    navigator.sendBeacon('/api/archive', new Blob([JSON.stringify(payload)], { type: 'application/json' }));
  } catch {
    // ignore
  }
}
window.addEventListener('beforeunload', flushArchiveSaveOnUnload);

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
  let exams = [];
  try {
    const res = await fetch('/api/archive');
    const data = await res.json();
    exams = data.success ? data.exams : [];
  } catch {
    exams = [];
  }

  // De dang mo khong con trong danh sach (bi xoa cuc bo, hoac keo ve thanh
  // tombstone) -> bo lien ket archiveId de lan sua sau tao ban ghi moi thay vi
  // cap nhat ban ghi da xoa.
  if (state.archiveId && !exams.some(e => e.exam_id === state.archiveId)) {
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
  ensureIds(state.blocks);
  normalizeExamMath(state.blocks); // TASK E: nang cap cong thuc toan de cu -> $...$
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
}

async function deleteArchivedExam(ex) {
  const ok = window.confirm(
    `Xóa đề "${ex.title || 'Đề chưa đặt tên'}"?\n\n` +
    `• Đề chỉ bị xóa TRÊN MÁY NÀY.\n` +
    `• Bấm "⬆️ Đẩy lên" sau đó để xóa vĩnh viễn trên cloud.\n` +
    `• Nếu xóa nhầm (và chưa Đẩy lên), bấm "⬇️ Kéo về" để khôi phục.`
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

let syncHasToken = false;
let syncGistId = '';

function setSyncStatus(msg, kind) {
  syncStatusEl.textContent = msg || '';
  syncStatusEl.classList.toggle('is-error', kind === 'error');
  syncStatusEl.classList.toggle('is-ok', kind === 'ok');
}

function renderSyncState() {
  const masked = tokenStateLabel.dataset.masked;
  tokenStateLabel.textContent = syncHasToken
    ? (masked ? `✅ Đã lưu (${masked})` : '✅ Đã lưu')
    : '⚠️ Chưa có';
  tokenStateLabel.classList.toggle('is-set', syncHasToken);
  gistStateLabel.textContent = syncGistId ? `✅ ${syncGistId}` : '⚠️ Chưa có';
  gistStateLabel.classList.toggle('is-set', !!syncGistId);
  // "Tạo Gist ID mới" cần token trước.
  createGistBtn.disabled = !syncHasToken;
}

async function loadSyncSettings() {
  try {
    const res = await fetch('/api/sync/settings');
    const data = await res.json();
    if (!data.success) return;
    syncHasToken = !!data.has_token;
    syncGistId = data.gist_id || '';
    if (data.has_token && data.masked_token) tokenStateLabel.dataset.masked = data.masked_token;
    renderSyncState();
    syncMetaEl.textContent = data.last_synced_at
      ? `Đồng bộ lần cuối: ${formatDateShort(data.last_synced_at)}`
      : 'Chưa đồng bộ lần nào.';
  } catch {
    // giu nguyen trang thai hien tai
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
    createGistBtn.disabled = false;
  }
});

async function runSync(direction) {
  syncPushBtn.disabled = true;
  syncPullBtn.disabled = true;
  setSyncStatus(direction === 'pull' ? '⏳ Đang kéo về từ Gist...' : '⏳ Đang đẩy lên Gist...', '');
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
  } catch (err) {
    setSyncStatus('❌ ' + err.message, 'error');
  } finally {
    syncPushBtn.disabled = false;
    syncPullBtn.disabled = false;
  }
}

syncPullBtn.addEventListener('click', () => runSync('pull'));
syncPushBtn.addEventListener('click', () => runSync('push'));
