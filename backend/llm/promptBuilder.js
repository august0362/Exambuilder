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
  return `YÊU CẦU SỐ LƯỢNG CÂU HỎI:\n${lines.join('\n')}`;
}

/**
 * sectionsContent: mang cac chuoi noi dung (tu RESOURCE_SECTION) da duoc
 * giao vien chon lam ngu canh.
 * questionSpec: mang { loai, muc_do, so_luong } theo dung tu vung Loai/Muc_Do
 * ma TextPromptParser dang dung (TN/DUNG_SAI/DIEN_TU/TU_LUAN, Nhan_Biet/...).
 */
function buildPrompt({ topic, sectionsContent = [], questionSpec = [] }) {
  const instructions = extractFormatInstructions().replace(
    '[NHẬP MÔN HỌC/CHỦ ĐỀ Ở ĐÂY]',
    topic || 'chủ đề chưa được nêu cụ thể'
  );

  const parts = [instructions];

  if (sectionsContent.length > 0) {
    parts.push(
      'NGỮ CẢNH THAM KHẢO (dựa vào nội dung sau để ra đề, không bịa kiến thức ngoài phạm vi này):\n' +
      sectionsContent.join('\n\n---\n\n')
    );
  }

  const specText = formatQuestionSpec(questionSpec);
  if (specText) parts.push(specText);

  return parts.join('\n\n');
}

function buildRetryPrompt(originalPrompt, errorMessage) {
  return `${originalPrompt}\n\n---\nLẦN TRƯỚC BẠN TRẢ VỀ SAI ĐỊNH DẠNG, LỖI CỤ THỂ:\n${errorMessage}\nHãy sửa lại và CHỈ trả về đúng định dạng theo hướng dẫn ở trên, không thêm giải thích nào khác ngoài định dạng đó.`;
}

module.exports = { buildPrompt, buildRetryPrompt, extractFormatInstructions };
