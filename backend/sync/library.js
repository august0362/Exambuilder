'use strict';

const LIBRARY_SCHEMA = 'exambuilder/library@1';

function nowIso() {
  return new Date().toISOString();
}

// Moc thoi gian -> epoch ms. Chap nhan ISO 8601 (co/khong ms, Z hoac +07:00)
// va dinh dang SQLite 'YYYY-MM-DD HH:MM:SS' (coi la UTC). Sai -> NaN.
function parseTime(value) {
  if (!value) return NaN;
  const text = String(value).trim();
  return Date.parse(text.includes('T') ? text : `${text.replace(' ', 'T')}Z`);
}

// Chuan hoa moc thoi gian ve ISO 8601 UTC de so sanh chuoi luon dung thu tu,
// bat ke nguon la SQLite (strftime) hay Date.toISOString() cua client kia.
function toIso(value) {
  if (!value) return null;
  const t = parseTime(value);
  return Number.isNaN(t) ? String(value) : new Date(t).toISOString();
}

// Chong lech dong ho: moc o tuong lai qua 24h (vd. nam 9999) bi kep ve "bay
// gio", neu khong ban do se thang moi lan hop nhat mai mai.
const MAX_CLOCK_SKEW_MS = 86400000;

function clampIso(value, now) {
  if (!value) return null;
  const t = parseTime(value);
  if (Number.isNaN(t)) return null;
  return t > now + MAX_CLOCK_SKEW_MS ? new Date(now).toISOString() : new Date(t).toISOString();
}

// Moc dung de so sanh "ban nao moi hon". Thieu / sai -> 0 (luon thua).
function examTime(exam) {
  const t = parseTime(exam && exam.updated_at);
  return Number.isNaN(t) ? 0 : t;
}

function emptyLibrary() {
  return { schema: LIBRARY_SCHEMA, updated_at: nowIso(), exams: [] };
}

// --- Chu de mau (theme) dong bo kem thu vien ---------------------------------
// Chi dong bo `theme_id`; co chu (font scale) van cuc bo tung may. Luat hop
// nhat KHAC voi de: "lan doi gan nhat thang" theo `updated_at`, hoa -> primary.
const THEME_ID_RE = /^[a-z][a-z0-9-]{0,39}$/;

function sanitizeTheme(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!THEME_ID_RE.test(id)) return null;
  return { id, updated_at: toIso(raw.updated_at) || null };
}

function themeTime(theme) {
  if (!theme || !theme.updated_at) return 0;
  const t = Date.parse(theme.updated_at);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Chon ban theme "moi hon" giua 2 ben. Chuan hoa truoc (id sai -> null).
 * Bang moc thoi gian -> giu `primary` de ket qua tat dinh.
 */
function pickNewerTheme(primary, secondary) {
  const p = sanitizeTheme(primary);
  const s = sanitizeTheme(secondary);
  if (!p) return s;
  if (!s) return p;
  return themeTime(s) > themeTime(p) ? s : p;
}

/**
 * Chuan hoa 1 muc de trong thu vien: chi giu dung cac truong can thiet, ep
 * kieu nhe nhang de merge/so sanh on dinh giua 2 client.
 */
function normalizeExam(raw) {
  if (!raw || typeof raw !== 'object' || !raw.exam_id || !String(raw.exam_id).trim()) return null;
  const now = Date.now();
  const oldest = '1970-01-01T00:00:00.000Z';
  const exam = {
    exam_id: String(raw.exam_id),
    title: raw.title == null ? '' : String(raw.title),
    subject: raw.subject == null ? '' : String(raw.subject),
    duration_minutes: raw.duration_minutes == null ? null : Number(raw.duration_minutes),
    school_header: raw.school_header == null ? '' : String(raw.school_header),
    blocks: Array.isArray(raw.blocks) ? raw.blocks : [],
    created_at: clampIso(raw.created_at, now) || clampIso(raw.updated_at, now) || oldest,
    updated_at: clampIso(raw.updated_at, now) || clampIso(raw.created_at, now) || oldest,
    deleted_at: clampIso(raw.deleted_at, now)
  };
  // Keep the optional render-critical snapshot as JSON data. Binary assets belong
  // in the asset store and are represented here only by manifest references.
  if (raw.template_binding && typeof raw.template_binding === 'object' && !Array.isArray(raw.template_binding)) {
    exam.template_binding = raw.template_binding;
  }
  // Nen gan vao de (ten file anh trong resources/backgrounds): anh khong di
  // theo Gist, may kia thieu anh thi de van mo binh thuong, chi khong co nen.
  if (raw.background && typeof raw.background === 'object' && !Array.isArray(raw.background) &&
      typeof raw.background.file === 'string' && raw.background.file) {
    exam.background = { file: raw.background.file, opacity: Number(raw.background.opacity) || 0.3, fit: raw.background.fit === 'contain' ? 'contain' : 'cover' };
  }
  return exam;
}

/**
 * SAVED_EXAM rows (payload_json + cot) -> library object.
 */
function rowsToLibrary(rows) {
  const exams = [];
  for (const row of rows || []) {
    let payload = {};
    try {
      payload = JSON.parse(row.payload_json || '{}');
    } catch {
      payload = {};
    }
    const exam = normalizeExam({
      exam_id: row.exam_id,
      title: row.title != null ? row.title : payload.title,
      subject: row.subject != null ? row.subject : payload.subject,
      duration_minutes: row.duration_minutes != null ? row.duration_minutes : payload.duration_minutes,
      school_header: row.school_header != null ? row.school_header : payload.school_header,
      blocks: payload.blocks,
      template_binding: payload.template_binding,
      background: payload.background,
      created_at: row.created_at,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at
    });
    if (exam) exams.push(exam);
  }
  return { schema: LIBRARY_SCHEMA, updated_at: nowIso(), exams };
}

/**
 * library object -> danh sach row de UPSERT vao SAVED_EXAM.
 */
function libraryToRows(library) {
  const exams = (library && Array.isArray(library.exams)) ? library.exams : [];
  return exams
    .map(normalizeExam)
    .filter(Boolean)
    .map(e => ({
      exam_id: e.exam_id,
      title: e.title,
      subject: e.subject,
      duration_minutes: e.duration_minutes,
      school_header: e.school_header,
      payload_json: JSON.stringify({
        title: e.title,
        subject: e.subject,
        duration_minutes: e.duration_minutes,
        school_header: e.school_header,
        blocks: e.blocks,
        ...(e.template_binding ? { template_binding: e.template_binding } : {}),
        ...(e.background ? { background: e.background } : {})
      }),
      created_at: e.created_at,
      updated_at: e.updated_at,
      deleted_at: e.deleted_at
    }));
}

/**
 * Doc bat ky thu gi lay ve tu Gist (chuoi JSON hoac object) thanh library
 * hop le. Loi cu phap / cau truc sai -> library rong (khong nem loi de mot
 * lan push dau tien van chay duoc).
 */
function parseLibrary(input) {
  let obj = input;
  if (typeof input === 'string') {
    try {
      obj = JSON.parse(input);
    } catch {
      return emptyLibrary();
    }
  }
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.exams)) {
    return emptyLibrary();
  }
  const out = {
    schema: obj.schema || LIBRARY_SCHEMA,
    updated_at: obj.updated_at || nowIso(),
    exams: dedupeExams(obj.exams.map(normalizeExam).filter(Boolean))
  };
  const theme = sanitizeTheme(obj.theme);
  if (theme) out.theme = theme;
  return out;
}

// Trung exam_id trong CUNG 1 thu vien: giu ban moi hon; bang nhau -> ban dung sau.
function dedupeExams(exams) {
  const byId = new Map();
  for (const exam of exams) {
    const prev = byId.get(exam.exam_id);
    if (!prev || examTime(exam) >= examTime(prev)) byId.set(exam.exam_id, exam);
  }
  return Array.from(byId.values());
}

/**
 * Ban "nghiem" cua parseLibrary cho noi dung lay tu Gist khi dong bo: file
 * vang mat / rong -> thu vien rong (lan push dau tien); co noi dung nhung hong
 * -> NEM LOI. Neu coi noi dung hong la "rong" thi Push se ghi de mat sach du
 * lieu tren cloud, Pull bao thanh cong gia.
 */
function parseLibraryStrict(input) {
  if (input == null || (typeof input === 'string' && !input.trim())) return emptyLibrary();
  let obj = input;
  if (typeof input === 'string') {
    try {
      obj = JSON.parse(input);
    } catch {
      obj = null;
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || !Array.isArray(obj.exams)) {
    throw new Error('Noi dung thu vien tren Gist bi hong (khong phai JSON hop le). Da dung dong bo de tranh mat du lieu.');
  }
  if (obj.exams.some(exam => !normalizeExam(exam))) {
    throw new Error('Noi dung thu vien tren Gist co muc de bi hong. Da dung dong bo de tranh mat du lieu.');
  }
  return parseLibrary(obj);
}

/**
 * Hop nhat 2 thu vien theo exam_id, union toan bo id o ca 2 ben. Trung id ->
 * "lan doi gan nhat thang" (Last-Write-Wins) theo updated_at; tombstone
 * (deleted_at) cung chi la 1 phien ban, thang khi moi hon. Bang moc thoi gian
 * -> primary thang (huong dong bo chi con la tie-break). `theme` cung LWW
 * (xem pickNewerTheme).
 *   - Pull : mergeLibraries(cloud, local)  -> ghi ket qua vao may
 *   - Push : mergeLibraries(local, cloud)  -> ghi ket qua len Gist
 * Giu dong bo voi LibraryMerge.kt (app Android).
 */
function mergeLibraries(primary, secondary) {
  const p = parseLibrary(primary);
  const s = parseLibrary(secondary);
  const byId = new Map();
  for (const exam of s.exams) byId.set(exam.exam_id, exam);
  for (const exam of p.exams) {
    const other = byId.get(exam.exam_id);
    if (!other || examTime(exam) >= examTime(other)) byId.set(exam.exam_id, exam);
  }
  const out = {
    schema: LIBRARY_SCHEMA,
    updated_at: nowIso(),
    exams: Array.from(byId.values()).sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
  };
  const theme = pickNewerTheme(p.theme, s.theme);
  if (theme) out.theme = theme;
  return out;
}

/**
 * Bo cac tombstone qua cu (mac dinh > 90 ngay) de file Gist khong phinh mai.
 */
function purgeOldTombstones(library, days = 90) {
  const lib = parseLibrary(library);
  const cutoff = Date.now() - days * 86400000;
  const out = {
    schema: LIBRARY_SCHEMA,
    updated_at: nowIso(),
    exams: lib.exams.filter(e => {
      if (!e.deleted_at) return true;
      const t = Date.parse(e.deleted_at);
      return Number.isNaN(t) || t >= cutoff;
    })
  };
  if (lib.theme) out.theme = lib.theme;
  return out;
}

function summarize(library) {
  const lib = parseLibrary(library);
  const active = lib.exams.filter(e => !e.deleted_at).length;
  return { total: lib.exams.length, active, tombstones: lib.exams.length - active };
}

module.exports = {
  LIBRARY_SCHEMA,
  emptyLibrary,
  normalizeExam,
  rowsToLibrary,
  libraryToRows,
  parseLibrary,
  parseLibraryStrict,
  sanitizeTheme,
  pickNewerTheme,
  mergeLibraries,
  purgeOldTombstones,
  summarize
};
