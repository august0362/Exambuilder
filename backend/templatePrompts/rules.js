const fs = require('fs');
const path = require('path');

const RULESET_VERSION = 'template-text-v1';
const GROUPS = Object.freeze(['FULL_EXAM', 'SELECTED_SLOTS', 'REVIEW_REPAIR']);
const VARIANTS = Object.freeze({
  ChatGPT: 'ĐẶC BIỆT VỚI CHATGPT: Tuyệt đối không dùng markdown fence ```, không giải thích hay chào hỏi trước/sau kết quả, bắt đầu ngay lập tức từ dòng tiêu đề phần đầu tiên.',
  Claude: 'ĐẶC BIỆT VỚI CLAUDE: Không viết lời mở đầu (như "Here is the exam..."), không viết lời kết; giữ nguyên 100% các mã định danh Ma_Khung và Ma_Phan.',
  Gemini: 'ĐẶC BIỆT VỚI GEMINI: Mỗi trường nằm trên đúng 1 dòng riêng; giữ nguyên dấu $ cho công thức LaTeX; không tự ý gộp đáp án hoặc đổi số câu.',
  DeepSeek: 'ĐẶC BIỆT VỚI DEEPSEEK: Tuyệt đối không xuất thẻ <think> hay phần suy luận nội bộ ra ngoài; chỉ xuất văn bản câu hỏi cuối cùng theo đúng định dạng.',
  Grok: 'ĐẶC BIỆT VỚI GROK: Giữ nguyên tất cả dấu phân cách =PHAN_X= và [CAU_HOI]; luôn điền đầy đủ đáp án chính xác và lời giải chi tiết từng bước.'
});
const TYPE_TO_LEGACY = Object.freeze({ MCQ: 'TN', TRUE_FALSE: 'DUNG_SAI', FILL_BLANK: 'DIEN_TU', ESSAY: 'TU_LUAN' });
const DIFFICULTY_TO_LEGACY = Object.freeze({ NB: 'Nhan_Biet', TH: 'Thong_Hieu', VD: 'Van_Dung', VDC: 'Van_Dung_Cao' });
// Hanh dong P3 duoc phep; chi hai hanh dong doi muc do moi duoc doi Muc_Do cua slot.
const REPAIR_INTENTS = Object.freeze({
  'rewrite-one': 'Sửa câu chọn cho đúng kiến thức, đáp án, lời giải và định dạng; giữ nguyên mức độ.',
  regenerate: 'Sinh lại câu mới hoàn toàn cho slot chọn, cùng loại câu, mức độ, điểm và số dòng.',
  'increase-difficulty': 'Viết lại câu chọn khó hơn đúng một mức (theo Muc_Do mới được chỉ định bên dưới).',
  'decrease-difficulty': 'Viết lại câu chọn dễ hơn đúng một mức (theo Muc_Do mới được chỉ định bên dưới).',
  'improve-solution': 'Giữ nguyên đề bài, các lựa chọn và đáp án; chỉ viết lại Loi_Giai đầy đủ, chặt chẽ hơn.',
  'restyle-keep-answer': 'Đổi cách diễn đạt đề bài cho rõ ràng hơn nhưng KHÔNG đổi đáp án đúng, ý nghĩa và mức độ.',
  'validate-only': 'Chỉ kiểm tra, không viết lại câu.'
});
const LEVEL_ORDER = Object.freeze(['NB', 'TH', 'VD', 'VDC']);

// Reuse the existing source for math conventions, without its fixed two-section/count rules.
function getMathRules() {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'Gemini_Prompt_Unified.txt'), 'utf8');
  const match = source.match(/━+ CÁCH VIẾT CÔNG THỨC TOÁN ━+([\s\S]*?)(?=━+ SỐ LƯỢNG CÂU HỎI ━+)/);
  if (!match) throw new Error('Không tìm thấy quy tắc toán trong Gemini_Prompt_Unified.txt');
  return `QUY TẮC TOÁN TỪ NGUỒN CHUNG:\n${match[1].trim()}`;
}

module.exports = { RULESET_VERSION, GROUPS, VARIANTS, TYPE_TO_LEGACY, DIFFICULTY_TO_LEGACY, REPAIR_INTENTS, LEVEL_ORDER, getMathRules };
