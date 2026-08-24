import { TextPromptParser } from '/parser/TextPromptParser.js';
import { FileUploadParser } from '/parser/FileUploadParser.js';
import { formatMathSymbols } from '/parser/mathFormat.js';
import { segmentFractions } from '/parser/mathFraction.js';
import { generateExamCodes, shuffleAllMCQOptions } from '/parser/examCodeGenerator.js';
import { EXAM_PROMPT_TEMPLATE, EXAM_PROMPT_EXAMPLE } from './promptTemplate.js';

// Ve noi dung dang phan so xep chong that (tu tren/mau duoi, co gach ngang)
// thay vi chi hien "a/b" nam ngang. Chi dung cho hien thi - du lieu goc
// trong state van la text thuong.
function renderMathInline(container, text) {
  container.innerHTML = '';
  segmentFractions(text).forEach(seg => {
    if (seg.type === 'text') {
      if (seg.value) container.appendChild(document.createTextNode(seg.value));
    } else {
      const frac = document.createElement('span');
      frac.className = 'frac';
      const num = document.createElement('span');
      num.className = 'frac-num';
      num.textContent = seg.num;
      const den = document.createElement('span');
      den.className = 'frac-den';
      den.textContent = seg.den;
      frac.appendChild(num);
      frac.appendChild(den);
      container.appendChild(frac);
    }
  });
}

const DIFFICULTY_LABEL = { NB: 'Nhận biết', TH: 'Thông hiểu', VD: 'Vận dụng', VDC: 'Vận dụng cao' };
const TYPE_LABEL = { MCQ: 'Trắc nghiệm', FILL_BLANK: 'Điền từ', TRUE_FALSE: 'Đúng/Sai', ESSAY: 'Tự luận' };

const state = {
  examId: null,
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

const examContainerEl = document.getElementById('examContainer');
const errorMessageEl = document.getElementById('errorMessage');

// ---------- Tabs ----------
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
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
  } catch (err) {
    showError(err.message);
  }
});

function ensureIds(blocks) {
  blocks.forEach(b => {
    b.id = b.id || crypto.randomUUID();
    b.questions.forEach(q => { q.id = q.id || crypto.randomUUID(); });
  });
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

  ctx.blocks.forEach((block, bi) => {
    const blockEl = document.createElement('div');
    blockEl.className = 'question-block';
    const titleEl = document.createElement('div');
    titleEl.className = 'question-block-title';
    titleEl.textContent = block.block_title || (block.block_type === 'ESSAY' ? 'Phần Tự luận' : 'Phần Trắc nghiệm');
    blockEl.appendChild(titleEl);

    block.questions.forEach((q, qi) => {
      blockEl.appendChild(renderQuestionCard(q, bi, qi, ctx));
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

function renderQuestionCard(q, bi, qi, ctx) {
  const card = document.createElement('div');
  card.className = 'question-card';

  const head = document.createElement('div');
  head.className = 'question-head';

  const contentWrap = document.createElement('div');
  contentWrap.className = 'question-content';
  const numberSpan = document.createElement('span');
  numberSpan.className = 'question-number';
  numberSpan.textContent = `Câu ${qi + 1}: `;
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
    if (q.explanation) renderMathInline(expl, q.explanation);
    else expl.textContent = expl.dataset.placeholder;
    expl.addEventListener('focus', () => {
      expl.textContent = expl.textContent === expl.dataset.placeholder ? '' : (q.explanation || '');
    });
    expl.addEventListener('blur', () => {
      if (!expl.textContent.trim()) { expl.textContent = expl.dataset.placeholder; return; }
      q.explanation = formatMathSymbols(expl.textContent);
      renderMathInline(expl, q.explanation);
    });
    expl.addEventListener('input', () => { q.explanation = expl.textContent === expl.dataset.placeholder ? '' : expl.textContent; });
    card.appendChild(expl);
  }

  return card;
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
    ans.textContent = q.correct_answer || '';
    ans.addEventListener('input', () => { q.correct_answer = ans.textContent; });
    ans.addEventListener('blur', () => {
      ans.textContent = formatMathSymbols(ans.textContent);
      q.correct_answer = ans.textContent;
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

  blocks.forEach(block => {
    children.push(new Paragraph({ text: block.block_title || '', heading: HeadingLevel.HEADING_2 }));

    block.questions.forEach((q, qi) => {
      children.push(new Paragraph({
        children: [new TextRun({ text: `Câu ${qi + 1}: `, bold: true }), new TextRun(q.content)]
      }));

      if (q.question_type === 'MCQ') {
        q.options.forEach(opt => {
          children.push(new Paragraph({ text: `   ${opt.option_key}. ${opt.option_text}` }));
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
            children: [new TextRun({ text: `Đáp án: ${q.correct_answer || ''}`, italics: true, color: '16A34A' })]
          }));
        }
      } else if (q.question_type === 'ESSAY') {
        const lines = q.draft_lines_count || 0;
        for (let i = 0; i < lines; i++) {
          children.push(new Paragraph({ text: '.......................................................................' }));
        }
      }

      if (!state.isStudentMode && q.explanation) {
        children.push(new Paragraph({
          children: [new TextRun({ text: `Giải thích: ${q.explanation}`, italics: true, color: '92400E' })]
        }));
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

// ---------- Load exam from share link on page load ----------
function loadExamIntoState(exam) {
  state.title = exam.title;
  state.subject = exam.subject;
  state.duration_minutes = exam.duration_minutes;
  state.school_header = exam.school_header;
  state.blocks = exam.blocks;
  ensureIds(state.blocks);
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
