const TYPE_ORDER = ['MCQ', 'TRUE_FALSE', 'FILL_BLANK'];
const DIFFICULTY_ORDER = ['NB', 'TH', 'VD', 'VDC'];

function uid() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Xao mang bang Fisher-Yates. Khong sua doi mang goc - tra ve ban sao.
export function fisherYatesShuffle(source) {
  const arr = source.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Chia 1 pool cau hoi (cung 1 loai) thanh q phan cho q ma de.
 * Moi ma de nhan floor(total/q) cau. Phan du (total % q) duoc rai
 * duy nhat 1 lan cho cac ma de duoc chon ngau nhien - vi tong so cau
 * da phan (base*q + remainder) dung bang total nen moi cau nguon chi
 * roi vao dung 1 ma de => khong ma de nao lap cau cua ma de khac
 * (chi lap khi q > total, luc do mot so ma de danh phai nhan 0 cau
 * loai nay vi nguon khong du de chia ma khong lap).
 */
export function allocateForCodes(pool, q) {
  const shuffledPool = fisherYatesShuffle(pool);
  const total = shuffledPool.length;
  const base = Math.floor(total / q);
  const remainder = total % q;

  const codeOrder = fisherYatesShuffle(Array.from({ length: q }, (_, i) => i));
  const remainderCodes = new Set(codeOrder.slice(0, remainder));

  const result = Array.from({ length: q }, () => []);
  let cursor = 0;
  for (let i = 0; i < q; i++) {
    const count = base + (remainderCodes.has(i) ? 1 : 0);
    result[i] = shuffledPool.slice(cursor, cursor + count);
    cursor += count;
  }
  return result;
}

// Xao thu tu cac lua chon A/B/C/D cua 1 cau MCQ, gan lai nhan chu cai
// theo vi tri moi va cap nhat correct_answer theo dung lua chon dung.
// Dung chung cho ca luc sinh de goc (chi xao options, giu nguyen id) lan
// luc nhan ban cho tung ma de (can id moi, xem cloneQuestionForCode).
export function shuffleMCQOptions(question) {
  // Du lieu nhap ngoai (JSON...) co the thieu is_correct: suy ra tu
  // correct_answer TRUOC khi xao, neu khong dap an se giu chu cai cu -> sai.
  const options = question.options.some(o => o.is_correct)
    ? question.options
    : question.options.map(o => ({ ...o, is_correct: o.option_key === String(question.correct_answer || '').trim().toUpperCase() }));
  const shuffledOptions = fisherYatesShuffle(options);
  const keys = ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, shuffledOptions.length);
  const newOptions = shuffledOptions.map((opt, i) => ({
    option_key: keys[i],
    option_text: opt.option_text,
    is_correct: opt.is_correct
  }));
  const correctOption = newOptions.find(o => o.is_correct);
  return {
    ...question,
    options: newOptions,
    correct_answer: correctOption ? correctOption.option_key : question.correct_answer
  };
}

// Xao vi tri dap an cho toan bo cau MCQ trong 1 bo blocks de goc, tranh
// thien lech (vi du dap an dung luon roi vao vi tri A khi noi dung nguon -
// AI sinh hoac nguoi nhap - co thoi quen dat dap an dung dau tien). Sua
// truc tiep tren blocks dau vao, khong tao ban sao.
export function shuffleAllMCQOptions(blocks) {
  blocks.forEach(block => {
    block.questions = block.questions.map(q => (
      q.question_type === 'MCQ' ? { ...shuffleMCQOptions(q), id: q.id } : q
    ));
  });
  return blocks;
}

function cloneQuestionForCode(question) {
  if (question.question_type === 'MCQ') return { ...shuffleMCQOptions(question), id: uid() };
  return { ...question, id: uid(), options: (question.options || []).map(o => ({ ...o })) };
}

function groupKey(type, difficulty) { return `${type}|${difficulty}`; }

// Gom cau hoi nguon theo tung cap (loai, muc_do) rieng biet - vd MCQ|NB,
// MCQ|TH, TRUE_FALSE|VD... Moi nhom se duoc chia deu rieng cho q ma de,
// dam bao ti le muc do kho trong tung loai cau hoi la dong deu giua cac
// ma de, thay vi chi dong deu tong so cau moi loai.
function groupQuestionsByTypeAndDifficulty(blocks) {
  const groups = new Map();
  blocks.forEach(b => b.questions.forEach(q => {
    const key = groupKey(q.question_type, q.difficulty_level);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(q);
  }));
  return groups;
}

// Danh sach muc do co that trong nguon cho 1 loai cau hoi, uu tien sap
// xep theo DIFFICULTY_ORDER (de -> kho) - muc do la nao vao them (khong
// thuoc DIFFICULTY_ORDER, hiem gap) van duoc giu, xep sau cung de khong
// mat du lieu.
function difficultiesForType(groups, type) {
  const present = new Set();
  groups.forEach((_, key) => {
    const [t, d] = key.split('|');
    if (t === type) present.add(d);
  });
  const known = DIFFICULTY_ORDER.filter(d => present.has(d));
  const unknown = [...present].filter(d => !DIFFICULTY_ORDER.includes(d));
  return [...known, ...unknown];
}

/**
 * Sinh q phien ban (ma de) tu 1 bo blocks cau hoi nguon.
 * - Gop cau hoi nguon theo tung cap (loai, muc_do), moi cap duoc xao va
 *   chia rieng bang allocateForCodes => ti le muc do kho (Nhan_Biet/
 *   Thong_Hieu/Van_Dung/Van_Dung_Cao) trong tung loai cau hoi la dong deu
 *   giua cac ma de, khong bi lech (vd 1 ma de toan cau de, ma khac toan
 *   cau kho).
 * - Moi ma de: khoi 1 "Phan I. Trac nghiem" gom MCQ + TRUE_FALSE +
 *   FILL_BLANK (theo thu tu do, trong moi loai sap theo muc do tu de den
 *   kho), khoi 2 "Phan II. Tu luan" gom ESSAY.
 * - MCQ duoc xao lai thu tu dap an cho tung ma de.
 *
 * @param {Array} blocks - blocks cau hoi nguon (dang state.blocks trong FE)
 * @param {number} q - so ma de can tao (>= 2)
 * @param {{prefix?: string, start?: number}} options
 * @returns {Array<{code: string, blocks: Array, stats: Object}>}
 */
export function generateExamCodes(blocks, q, options = {}) {
  const count = Math.max(2, Math.floor(q) || 0);
  const prefix = (options.prefix || 'Đề').trim() || 'Đề';
  const start = Number.isFinite(options.start) ? options.start : 101;

  const groups = groupQuestionsByTypeAndDifficulty(blocks);
  if (groups.size === 0) {
    throw new Error('Khong co cau hoi nao trong de goc de tron ma de.');
  }

  const ALL_TYPES = [...TYPE_ORDER, 'ESSAY'];
  const difficultyByType = {};
  ALL_TYPES.forEach(type => { difficultyByType[type] = difficultiesForType(groups, type); });

  const allocations = new Map();
  groups.forEach((pool, key) => { allocations.set(key, allocateForCodes(pool, count)); });

  const versions = [];
  for (let i = 0; i < count; i++) {
    const objective = [];
    TYPE_ORDER.forEach(type => {
      difficultyByType[type].forEach(diff => {
        const alloc = allocations.get(groupKey(type, diff));
        if (alloc) objective.push(...alloc[i].map(cloneQuestionForCode));
      });
    });
    const essay = [];
    difficultyByType.ESSAY.forEach(diff => {
      const alloc = allocations.get(groupKey('ESSAY', diff));
      if (alloc) essay.push(...alloc[i].map(cloneQuestionForCode));
    });

    const versionBlocks = [];
    if (objective.length) {
      versionBlocks.push({ id: uid(), block_type: 'MULTIPLE_CHOICE', block_title: 'Phần I. Trắc nghiệm', questions: objective });
    }
    if (essay.length) {
      versionBlocks.push({ id: uid(), block_type: 'ESSAY', block_title: 'Phần II. Tự luận', questions: essay });
    }

    const stats = { MCQ: 0, TRUE_FALSE: 0, FILL_BLANK: 0, ESSAY: 0 };
    groups.forEach((_, key) => {
      const [type] = key.split('|');
      stats[type] += allocations.get(key)[i].length;
    });

    versions.push({ code: `${prefix} ${start + i}`, blocks: versionBlocks, stats });
  }

  return versions;
}
