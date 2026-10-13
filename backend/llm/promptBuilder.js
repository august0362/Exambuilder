const fs = require('fs');
const path = require('path');

const TEMPLATE_PATH = path.join(__dirname, '..', '..', 'Gemini_Prompt_Unified.txt');

/**
 * Trich doan "PHAN 2 - PROMPT" trong Gemini_Prompt_Unified.txt - day la phan
 * huong dan dinh dang ma TextPromptParser hieu duoc. Tai su dung nguyen van
 * thay vi viet lai, de luon dong bo voi dinh dang giao vien dang dan tay.
 */
function extractFormatInstructions() {
  const fileText = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const startMatch = fileText.match(/PHẦN 2[^\n]*\n=+\n/);
  const endMatch = fileText.match(/\n=+\n\(kết thúc PROMPT\)/);
  if (!startMatch || !endMatch) {
    throw new Error('Khong trich xuat duoc huong dan dinh dang tu Gemini_Prompt_Unified.txt');
  }
  const start = startMatch.index + startMatch[0].length;
  return fileText.slice(start, endMatch.index).trim();
}

function formatQuestionSpec(questionSpec) {
  if (!Array.isArray(questionSpec) || questionSpec.length === 0) return '';
  const lines = questionSpec.map(s => `- ${s.so_luong} câu loại "${s.loai}", mức độ "${s.muc_do}"`);
  const total = questionSpec.reduce((n, s) => n + Number(s.so_luong || 0), 0);
  return `YÊU CẦU SỐ LƯỢNG CÂU HỎI (BẢNG — BẮT BUỘC, ƯU TIÊN CAO NHẤT):\n${lines.join('\n')}\nTổng cộng đúng ${total} câu. Không thêm, không bớt, không đổi loại câu hay mức độ so với bảng này.`;
}

// Bang (questionSpec) quyet dinh CAU TRUC; yeu cau viet tay quyet dinh NOI DUNG.
// Co bang: so cau/loai/muc do trong yeu cau viet tay ma khac bang thi theo bang.
// Khong co bang: yeu cau viet tay duoc quyet ca so luong; khong neu thi theo mac dinh.
function formatExtraInstructions(extraInstructions, hasSpec) {
  const text = String(extraInstructions || '').trim();
  if (!text) return '';
  return hasSpec
    ? `YÊU CẦU BỔ SUNG TỪ NGƯỜI DÙNG (áp dụng cho chủ đề, nội dung, dạng bài, phong cách; vẫn tuân thủ đúng định dạng ở trên). NẾU yêu cầu này nêu số câu, loại câu hoặc mức độ KHÁC với BẢNG số lượng phía dưới thì LÀM THEO BẢNG:\n${text}`
    : `YÊU CẦU TỪ NGƯỜI DÙNG (vẫn tuân thủ đúng định dạng ở trên). Nếu có nêu số câu, loại câu, mức độ thì tuân thủ đúng như vậy; phần nào không nêu thì theo mặc định ở trên:\n${text}`;
}

/**
 * sectionsContent: mang cac chuoi noi dung (tu RESOURCE_SECTION) da duoc
 * giao vien chon lam ngu canh.
 * questionSpec: mang { loai, muc_do, so_luong } theo dung tu vung Loai/Muc_Do
 * ma TextPromptParser dang dung (TN/DUNG_SAI/DIEN_TU/TU_LUAN, Nhan_Biet/...).
 * extraInstructions: yeu cau tu do nguoi dung go them (vd phong cach de, do kho
 * cu the...) - chi la phan bo sung, khong duoc thay the huong dan dinh dang.
 */
// Luong "AI hoi lai nguoi dung" (chi cho API tu dong): AI duoc tra khoi
// [HOI_NGUOI_DUNG] thay vi de khi thieu thong tin quan trong; route nhan dien
// khoi nay va hien cau hoi cho nguoi dung tra loi bang text.
const ASK_USER_RULE = `ĐƯỢC PHÉP HỎI LẠI NGƯỜI DÙNG: chỉ khi thiếu thông tin QUAN TRỌNG mà không thể đoán hợp lý (ví dụ không rõ môn học, lớp/cấp học hoặc chủ đề) thì KHÔNG ra đề, mà chỉ trả về đúng khối sau và không gì khác:
[HOI_NGUOI_DUNG]
1. <câu hỏi ngắn>
[/HOI_NGUOI_DUNG]
Tối đa 3 câu hỏi. Nếu đã đủ thông tin để ra một đề hợp lý thì ra đề luôn, không hỏi.`;

function formatClarifications(clarifications) {
  if (!Array.isArray(clarifications) || !clarifications.length) return '';
  const rounds = clarifications.map((c, i) => `Lần ${i + 1} — Câu hỏi của bạn:\n${c.question}\nTrả lời của người dùng:\n${c.answer}`);
  return `TRAO ĐỔI TRƯỚC VỚI NGƯỜI DÙNG (dùng các câu trả lời này để ra đề):\n${rounds.join('\n\n')}`;
}

function buildPrompt({ topic, sectionsContent = [], questionSpec = [], extraInstructions = '', allowQuestions = false, clarifications = [] }) {
  const instructions = extractFormatInstructions().replace(
    '[NHẬP MÔN HỌC/CHỦ ĐỀ Ở ĐÂY]',
    topic || 'chủ đề chưa được nêu cụ thể'
  );

  const parts = [instructions];

  if (sectionsContent.length > 0) {
    parts.push(
      'NGỮ CẢNH THAM KHẢO TỪ TÀI LIỆU CỦA GIÁO VIÊN (đọc kỹ TOÀN BỘ nội dung sau; ra đề bám sát kiến thức, thuật ngữ, ví dụ và mức độ trong tài liệu, kết hợp với chủ đề, yêu cầu và bảng số câu bên dưới; không bịa kiến thức ngoài phạm vi này):\n' +
      sectionsContent.join('\n\n---\n\n')
    );
  }

  // Yeu cau viet tay dat truoc, bang dat CUOI: lenh uu tien cao nhat la lenh AI doc sau cung.
  const specText = formatQuestionSpec(questionSpec);
  const extraText = formatExtraInstructions(extraInstructions, Boolean(specText));
  if (extraText) parts.push(extraText);
  const clarifyText = formatClarifications(clarifications);
  if (clarifyText) parts.push(clarifyText);
  if (specText) parts.push(specText);
  if (allowQuestions) parts.push(ASK_USER_RULE);
  else if (clarifyText) parts.push('ĐÃ ĐỦ THÔNG TIN: KHÔNG hỏi thêm, hãy ra đề ngay theo đúng định dạng.');

  return parts.join('\n\n');
}

// Prompt da dung san (vd prompt P1/P2/P3 cua thu vien mau): giu nguyen, chi them
// trao doi voi nguoi dung va luat duoc phep hoi lai.
function buildRawPrompt(rawPrompt, { allowQuestions = false, clarifications = [] } = {}) {
  const parts = [String(rawPrompt).trim()];
  const clarifyText = formatClarifications(clarifications);
  if (clarifyText) parts.push(clarifyText);
  if (allowQuestions) parts.push(ASK_USER_RULE);
  else if (clarifyText) parts.push('ĐÃ ĐỦ THÔNG TIN: KHÔNG hỏi thêm, hãy trả kết quả ngay theo đúng định dạng.');
  return parts.join('\n\n');
}

function buildRetryPrompt(originalPrompt, errorMessage) {
  return `${originalPrompt}\n\n---\nLẦN TRƯỚC BẠN TRẢ VỀ SAI ĐỊNH DẠNG, LỖI CỤ THỂ:\n${errorMessage}\nHãy sửa lại và CHỈ trả về đúng định dạng theo hướng dẫn ở trên, không thêm giải thích nào khác ngoài định dạng đó.`;
}

module.exports = { buildPrompt, buildRawPrompt, buildRetryPrompt, extractFormatInstructions };
