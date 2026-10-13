const crypto = require('crypto');
const express = require('express');
const { getDb } = require('../database');
const { createProvider } = require('../llm/ProviderFactory');
const { CLOUD_PROVIDER_IDS } = require('../llm/providerIds');
const { withErrorHint } = require('../llm/errorHint');
const { buildPrompt, buildRawPrompt, buildRetryPrompt } = require('../llm/promptBuilder');
const { selectContext } = require('../llm/contextRetriever');

const router = express.Router();

const MAX_RETRY = 2; // toi da 2 lan thu lai sau lan dau, tong toi da 3 lan goi LLM

// Loi tam thoi cua hang AI dang thu lai tu dong. 429 do HET QUOTA/credit khong
// phai tam thoi (thu lai vo ich) nen loai ra.
const BUSY_RETRY_DELAYS_MS = process.env.NODE_ENV === 'test' ? [5, 5] : [4000, 10000];
function isTransientError(message) {
  const text = String(message || '');
  if (/insufficient_quota|credit balance|billing|exceeded your current quota/i.test(text)) return false;
  return /HTTP (429|500|502|503|504|529)\b|UNAVAILABLE|overloaded|high demand|RESOURCE_EXHAUSTED|try again later/i.test(text);
}
function waitUnlessAborted(ms, signal) {
  return new Promise(resolve => {
    if (signal?.aborted) return resolve(false);
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(true); }, ms);
    const onAbort = () => { clearTimeout(timer); resolve(false); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

const LEGACY_TYPE = { MCQ: 'TN', TRUE_FALSE: 'DUNG_SAI', FILL_BLANK: 'DIEN_TU', ESSAY: 'TU_LUAN' };
const LEGACY_LEVEL = { NB: 'Nhan_Biet', TH: 'Thong_Hieu', VD: 'Van_Dung', VDC: 'Van_Dung_Cao' };
const TYPE_LABEL = { TN: 'trắc nghiệm', DUNG_SAI: 'đúng/sai', DIEN_TU: 'điền từ', TU_LUAN: 'tự luận' };

// So sanh so cau AI tra ve voi bang loai x muc do; tra danh sach mo ta lech.
function questionSpecMismatches(blocks, questionSpec) {
  if (!Array.isArray(questionSpec) || !questionSpec.length) return [];
  const actual = new Map();
  for (const block of blocks) for (const q of block.questions || []) {
    const key = `${LEGACY_TYPE[q.question_type]}|${LEGACY_LEVEL[q.difficulty_level]}`;
    actual.set(key, (actual.get(key) || 0) + 1);
  }
  const expected = new Map();
  for (const s of questionSpec) {
    const key = `${s.loai}|${s.muc_do}`;
    expected.set(key, (expected.get(key) || 0) + Number(s.so_luong || 0));
  }
  const issues = [];
  for (const key of new Set([...expected.keys(), ...actual.keys()])) {
    const want = expected.get(key) || 0;
    const got = actual.get(key) || 0;
    if (want !== got) {
      const [loai, mucDo] = key.split('|');
      issues.push(`${TYPE_LABEL[loai] || loai} ${String(mucDo).replace(/_/g, ' ')}: cần ${want}, AI trả ${got}`);
    }
  }
  return issues;
}
const VALID_PROVIDERS = CLOUD_PROVIDER_IDS;

// AI duoc phep hoi lai nguoi dung bang khoi [HOI_NGUOI_DUNG]...[/HOI_NGUOI_DUNG]
// (xem promptBuilder). Chi tinh la cau hoi khi khong co [CAU_HOI] nao.
const ASK_RE = /\[HOI_NGUOI_DUNG\]([\s\S]*?)(?:\[\/HOI_NGUOI_DUNG\]|$)/i;
function extractQuestionsForUser(rawText) {
  if (/\[CAU_HOI\]/i.test(rawText)) return null;
  const match = String(rawText).match(ASK_RE);
  const text = match && match[1].trim();
  return text ? text.slice(0, 2000) : null;
}
const MAX_CLARIFY_ROUNDS = 2;
function normalizeClarifications(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_CLARIFY_ROUNDS).map(c => ({
    question: String(c?.question || '').slice(0, 2000),
    answer: String(c?.answer || '').slice(0, 2000)
  })).filter(c => c.question && c.answer);
}

/**
 * Chay toan bo mot lan sinh de, bao tien do qua onProgress({stage, attempt, max_attempts, message}).
 * Tra { status, body } de dung chung cho POST / (dong bo) va job (bat dong bo).
 */
async function runGeneration(reqBody, onProgress = () => {}, { signal } = {}) {
  const cancelledReply = () => ({ status: 499, body: { success: false, cancelled: true, error: 'Da dung sinh de theo yeu cau' } });
  const { model_id, provider: cloudProvider, model_name, section_ids = [], topic, question_spec = [], extra_instructions, allow_questions = false } = reqBody || {};
  const clarifications = normalizeClarifications(reqBody?.clarifications);
  const reply = (status, body) => ({ status, body });
  const validSpec = Array.isArray(question_spec) && question_spec.every(s => s && Object.values(LEGACY_TYPE).includes(s.loai)
    && Object.values(LEGACY_LEVEL).includes(s.muc_do) && Number.isInteger(s.so_luong) && s.so_luong > 0 && s.so_luong <= 200);
  if (!validSpec) {
    return reply(400, { success: false, error: 'Bang so luong cau hoi khong hop le (loai/muc do/so luong 1-200)' });
  }
  onProgress({ stage: 'prepare', message: 'Đang chuẩn bị prompt và tài liệu tham khảo...' });

  const db = await getDb();

  let modelRow;
  let apiKey = null;

  if (cloudProvider || model_name) {
    // Model cloud "live" - khong can dang ky vao LLM_MODEL, chi can key da luu.
    if (!VALID_PROVIDERS.includes(cloudProvider)) {
      return reply(400, { success: false, error: `provider khong hop le: "${cloudProvider}"` });
    }
    if (!model_name || !String(model_name).trim()) {
      return reply(400, { success: false, error: 'Thieu model_name' });
    }
    const settings = await db.get('SELECT api_key FROM LLM_SETTINGS WHERE provider = ?', [cloudProvider]);
    if (!settings) {
      return reply(400, { success: false, error: `Chua cau hinh API key cho provider "${cloudProvider}"` });
    }
    apiKey = settings.api_key;
    modelRow = { source_type: 'cloud', provider: cloudProvider, model_name };
  } else if (model_id) {
    modelRow = await db.get('SELECT * FROM LLM_MODEL WHERE model_id = ?', [model_id]);
    if (!modelRow) {
      return reply(404, { success: false, error: 'Khong tim thay model da chon' });
    }
    if (modelRow.source_type === 'cloud') {
      const settings = await db.get('SELECT api_key FROM LLM_SETTINGS WHERE provider = ?', [modelRow.provider]);
      if (!settings) {
        return reply(400, { success: false, error: `Chua cau hinh API key cho provider "${modelRow.provider}"` });
      }
      apiKey = settings.api_key;
    }
  } else {
    return reply(400, { success: false, error: 'Thieu model_id hoac provider/model_name' });
  }

  let provider;
  try {
    provider = createProvider(modelRow, apiKey);
  } catch (err) {
    return reply(400, { success: false, error: err.message });
  }

  // Tai lieu: phan duoc tick, hoac TOAN BO tai lieu khi chi chon doc_id (mac dinh
  // "doc het"). selectContext dua nguyen van neu vua ngan sach, qua dai thi chon
  // cac doan lien quan nhat toi chu de + yeu cau (RAG don gian, offline).
  let rows = [];
  if (Array.isArray(section_ids) && section_ids.length > 0) {
    const placeholders = section_ids.map(() => '?').join(',');
    rows = await db.all(
      `SELECT section_title, content FROM RESOURCE_SECTION WHERE section_id IN (${placeholders}) ORDER BY sort_order ASC`,
      section_ids
    );
  } else if (reqBody?.doc_id) {
    rows = await db.all('SELECT section_title, content FROM RESOURCE_SECTION WHERE doc_id = ? ORDER BY sort_order ASC', [String(reqBody.doc_id)]);
  }
  const context = selectContext(rows.map(r => ({ title: r.section_title, content: r.content })), `${topic || ''} ${extra_instructions || ''}`);
  const sectionsContent = context.texts;
  if (context.info.sections) {
    const kb = n => `${n < 1000 ? n : (n / 1000).toFixed(1) + 'k'} ký tự`;
    onProgress({ stage: 'prepare', message: context.info.mode === 'full'
      ? `AI đọc toàn bộ ${context.info.sections} phần tài liệu (${kb(context.info.used_chars)}).`
      : `Tài liệu dài ${kb(context.info.total_chars)}: chọn ${context.info.used_chunks}/${context.info.total_chunks} đoạn liên quan nhất (${kb(context.info.used_chars)}).` });
  }

  // raw_prompt: prompt dung san (P1/P2/P3 cua thu vien mau). Khong parse o day -
  // tra van ban tho de bo kiem tra/anh xa slot cua thu vien mau xu ly va cho duyet.
  const rawMode = typeof reqBody?.raw_prompt === 'string' && reqBody.raw_prompt.trim().length > 0;
  if (rawMode && Buffer.byteLength(reqBody.raw_prompt, 'utf8') > 512 * 1024) {
    return reply(400, { success: false, error: 'Prompt vuot gioi han 512 KiB' });
  }
  const askAllowed = Boolean(allow_questions) && clarifications.length < MAX_CLARIFY_ROUNDS;
  let prompt;
  try {
    prompt = rawMode
      ? buildRawPrompt(reqBody.raw_prompt, { allowQuestions: askAllowed, clarifications })
      : buildPrompt({ topic, sectionsContent, questionSpec: question_spec, extraInstructions: extra_instructions,
        allowQuestions: askAllowed, clarifications });
  } catch (err) {
    console.error(err);
    return reply(500, { success: false, error: 'Loi tao prompt' });
  }

  const { TextPromptParser } = await import('../parser/TextPromptParser.js');
  const parser = new TextPromptParser();

  let lastParseError = null;
  let currentPrompt = prompt;
  const maxAttempts = MAX_RETRY + 1;

  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    onProgress({ stage: 'calling', attempt: attempt + 1, max_attempts: maxAttempts,
      message: attempt === 0 ? 'Đang chờ AI soạn đề...' : `Đang nhờ AI sửa lại (lần ${attempt + 1}/${maxAttempts})...` });
    if (signal?.aborted) return cancelledReply();
    let rawText;
    // Loi tam thoi (qua tai 503/529, 5xx, rate limit 429 khong phai het quota):
    // tu doi roi thu lai, khong tinh vao luot sua dinh dang.
    for (let busyTry = 0; ; busyTry++) {
      try {
        rawText = await provider.generate(currentPrompt, { signal });
        break;
      } catch (err) {
        if (signal?.aborted || err.code === 'USER_ABORT') return cancelledReply();
        if (!isTransientError(err.message) || busyTry >= BUSY_RETRY_DELAYS_MS.length) {
          return reply(502, { success: false, error: withErrorHint(err.message), transient: isTransientError(err.message) });
        }
        const waitMs = BUSY_RETRY_DELAYS_MS[busyTry];
        onProgress({ stage: 'calling', attempt: attempt + 1, max_attempts: maxAttempts,
          message: `Máy chủ AI đang quá tải/tạm lỗi, tự thử lại sau ${Math.round(waitMs / 1000)} giây (lần ${busyTry + 1}/${BUSY_RETRY_DELAYS_MS.length})...` });
        if (!await waitUnlessAborted(waitMs, signal)) return cancelledReply();
      }
    }
    // Model local khong huy giua chung duoc: bo ket qua neu nguoi dung da dung.
    if (signal?.aborted) return cancelledReply();

    const questions = allow_questions ? extractQuestionsForUser(rawText) : null;
    if (questions) {
      return reply(200, { success: true, needs_input: true, questions, round: clarifications.length + 1, max_rounds: MAX_CLARIFY_ROUNDS });
    }
    if (rawMode) return reply(200, { success: true, raw_text: rawText });

    onProgress({ stage: 'checking', attempt: attempt + 1, max_attempts: maxAttempts, message: 'Đang kiểm tra định dạng và số câu...' });
    try {
      const blocks = parser.parse(rawText);
      // Bang so luong la uu tien cao nhat: lech so cau thi nhac AI sua; het luot
      // thi van tra de (khong bo phi noi dung) kem canh bao cu the.
      const specIssues = questionSpecMismatches(blocks, question_spec);
      if (!specIssues.length) return reply(200, { success: true, blocks, context_info: context.info });
      if (attempt === MAX_RETRY) return reply(200, { success: true, blocks, spec_warnings: specIssues, context_info: context.info });
      lastParseError = new Error(specIssues.join('; '));
      onProgress({ stage: 'retry', attempt: attempt + 1, max_attempts: maxAttempts, message: `Số câu chưa khớp bảng (${specIssues.join('; ')}), nhờ AI sửa...` });
      currentPrompt = buildRetryPrompt(prompt, `Số lượng câu chưa đúng BẢNG: ${specIssues.join('; ')}. Hãy trả lại TOÀN BỘ đề với đúng số câu theo bảng.`);
    } catch (parseErr) {
      lastParseError = parseErr;
      onProgress({ stage: 'retry', attempt: attempt + 1, max_attempts: maxAttempts, message: 'AI trả sai định dạng, đang nhờ sửa...' });
      currentPrompt = buildRetryPrompt(prompt, parseErr.message);
    }
  }

  return reply(422, {
    success: false,
    error: 'AI sinh sai dinh dang sau nhieu lan thu',
    details: lastParseError ? lastParseError.message : null
  });
}

router.post('/', async (req, res) => {
  try {
    const { status, body } = await runGeneration(req.body);
    res.status(status).json(body);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Loi sinh de' });
  }
});

// Job bat dong bo de giao dien hien thanh tien do: POST tao job, GET hoi trang thai.
// Luu trong bo nho (app mot nguoi dung); job xong giu 30 phut roi xoa.
const JOB_TTL_MS = 30 * 60 * 1000;
const jobs = new Map();
function pruneJobs(now = Date.now()) {
  for (const [id, job] of jobs) if (job.finished_at && now - job.finished_at > JOB_TTL_MS) jobs.delete(id);
}
router.post('/jobs', (req, res) => {
  pruneJobs();
  const id = crypto.randomUUID();
  const controller = new AbortController();
  const job = { id, state: 'running', stage: 'queued', message: 'Đang bắt đầu...', attempt: 0, max_attempts: MAX_RETRY + 1, started_at: Date.now(), finished_at: null, status: null, result: null, cancel_mode: null, controller };
  jobs.set(id, job);
  runGeneration(req.body, progress => { if (!job.cancel_mode) Object.assign(job, progress); }, { signal: controller.signal })
    .then(({ status, body }) => Object.assign(job, job.cancel_mode
      ? { state: 'done', stage: job.cancel_mode === 'stop' ? 'stopped' : 'cancelled', status: 499, result: { success: false, cancelled: true, mode: job.cancel_mode }, finished_at: Date.now() }
      : { state: 'done', stage: 'done', status, result: body, finished_at: Date.now() }))
    .catch(err => {
      console.error(err);
      Object.assign(job, { state: 'done', stage: 'done', status: 500, result: { success: false, error: 'Loi sinh de' }, finished_at: Date.now() });
    });
  res.status(202).json({ success: true, job_id: id });
});
router.get('/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ success: false, error: 'Khong tim thay tien trinh sinh de' });
  const { id, state, stage, message, attempt, max_attempts, started_at, status, result } = job;
  res.json({ success: true, job: { id, state, stage, message, attempt, max_attempts, elapsed_ms: Date.now() - started_at, status, result } });
});

// Dung (stop) hoac huy (cancel): ca hai deu cat request AI dang cho ngay lap tuc.
// Khac nhau o giao dien: dung giu nguyen yeu cau de "Tiep tuc"; huy xoa sach.
// Luu y: hang AI co the van tinh phi phan token da sinh truoc khi bi cat.
router.post('/jobs/:id/cancel', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ success: false, error: 'Khong tim thay tien trinh sinh de' });
  const mode = req.body?.mode === 'stop' ? 'stop' : 'cancel';
  if (job.state !== 'running') return res.json({ success: true, already_finished: true });
  job.cancel_mode = mode;
  job.message = mode === 'stop' ? 'Đã dừng.' : 'Đã hủy.';
  job.controller.abort();
  res.json({ success: true, mode });
});

module.exports = router;
