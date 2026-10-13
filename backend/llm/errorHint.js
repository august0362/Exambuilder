// Gan goi y tieng Viet vao loi tu API hang AI (giu nguyen thong bao goc de
// chan doan). Chi doc ma HTTP/thong bao loi, khong bao gio chua API key.
const HINTS = [
  [/credit balance|insufficient.?balance|insufficient_quota|billing|payment required|HTTP 402/i,
    'Tài khoản API của hãng này đã hết tiền/credit. Nạp thêm trên trang quản lý của hãng (Anthropic: console.anthropic.com → Plans & Billing; OpenAI: platform.openai.com → Billing; DeepSeek: platform.deepseek.com → Top up) hoặc chọn hãng khác.'],
  [/HTTP 401|invalid.?api.?key|incorrect api key|authentication/i,
    'API key sai hoặc đã bị thu hồi. Tạo key mới rồi lưu lại trong Cài đặt.'],
  [/HTTP 403|permission/i,
    'Key không có quyền dùng model này. Kiểm tra quyền/tier của tài khoản hoặc chọn model khác.'],
  [/HTTP 404|not.?found|does not exist/i,
    'Model không tồn tại hoặc đã ngừng. Bấm tải lại danh sách model và chọn model khác.'],
  [/HTTP 50[0234]|UNAVAILABLE|high demand|overloaded|HTTP 529/i,
    'Máy chủ của hãng AI đang quá tải hoặc tạm lỗi (không phải lỗi của ExamBuilder hay API key). App đã tự thử lại vài lần; hãy đợi vài phút rồi bấm "Thử lại", hoặc chọn model/hãng khác (ví dụ model Flash nhẹ hơn).'],
  [/HTTP 429|rate.?limit|quota|RESOURCE_EXHAUSTED/i,
    'Bị giới hạn tần suất/hạn mức của tài khoản API. Đợi vài phút rồi thử lại, hoặc kiểm tra hạn mức trên trang quản lý của hãng.'],
  [/timeout|het thoi gian/i,
    'Hãng AI phản hồi quá lâu. Thử lại, giảm số câu, hoặc chọn model nhanh hơn.'],
  [/khong the ket noi|fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET/i,
    'Không kết nối được tới máy chủ hãng AI. Kiểm tra mạng/proxy/tường lửa.']
];

// "Hang: loi API (HTTP 503) - {json}" -> "Hang: loi API (HTTP 503) - <message trong json>"
// de khong do nguyen khoi JSON nhieu dong len giao dien.
function compactDetail(text) {
  const i = text.indexOf(' - {');
  if (i < 0) return text;
  try {
    const body = JSON.parse(text.slice(i + 3));
    const msg = body?.error?.message || body?.message || body?.error;
    return typeof msg === 'string' && msg ? `${text.slice(0, i)} - ${msg}` : text;
  } catch {
    return text;
  }
}

function withErrorHint(message) {
  const text = compactDetail(String(message || ''));
  const hit = HINTS.find(([pattern]) => pattern.test(text));
  return hit ? `${hit[1]} (Chi tiết: ${text})` : text;
}

module.exports = { withErrorHint };
