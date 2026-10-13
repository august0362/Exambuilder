# ExamBuilder 2.0 — yêu cầu hệ thống template

Ngày lập: 11/10/2026. Nguồn quyết định: `prompt_update.txt`, Phần I–II (42 câu đã chốt). Đây là yêu cầu triển khai trên ứng dụng hiện có, không phải mô tả tính năng đã hoàn tất.

## Người dùng và luồng chính

- Giáo viên chọn một trong đúng 10 mẫu gốc, nhập metadata và nội dung vào slot mà không đổi số câu/cấu trúc của mẫu gốc.
- Giáo viên tạo bản sao tùy chỉnh để thêm, xóa, đổi thứ tự phần/câu, điểm, vùng trả lời, trang và hình thức; lưu, mở lại, xuất/nhập bản sao.
- Giáo viên chọn P1/P2/P3 và một trong ChatGPT, Claude, Gemini, DeepSeek, Grok; xem và sao chép prompt động; dùng AI ngoài sinh **văn bản thuần**, dán về, xem lỗi ánh xạ rồi duyệt bản thay đổi trước khi áp dụng. Luồng này chạy không cần API key.
- Giáo viên tải nền ảnh/DOCX/PDF; chọn dùng làm nền hoặc thử trích cấu trúc bằng cách xác định rồi duyệt/sửa tay. PDF scan dùng làm nền và đánh dấu vùng thủ công; phiên bản này không có OCR.
- Giáo viên xem/xuất bản học sinh, giáo viên, đáp án riêng hoặc cuối cùng một file; PDF/DOCX có A4/A5, dọc/ngang, lề, header/footer, số trang, tự phân trang hoặc giới hạn trang kèm cảnh báo không cắt nội dung.
- Android mở, xem, xuất đề từ template, chỉnh sửa cơ bản, dùng offline khi có dữ liệu; tài nguyên thiếu/quá lớn phải được báo và giữ nguyên chữ, câu, đáp án.

## Đúng mười mẫu gốc

| ID | Tên cố định | Đặc điểm |
| --- | --- | --- |
| T01 | Đề kiểm tra 15 phút | Bài ngắn |
| T02 | Đề kiểm tra 45 phút | Bài một tiết |
| T03 | Đề giữa học kỳ | Phân phần/điểm |
| T04 | Đề cuối học kỳ | Phân phần/điểm |
| T05 | Đề 100% trắc nghiệm | Các câu trắc nghiệm |
| T06 | Đề 100% tự luận | Vùng trả lời |
| T07 | Đề kết hợp nhiều dạng câu | Nhiều loại câu |
| T08 | Đề Toán có nhiều vùng trình bày lời giải | Vùng lời giải chuyên biệt |
| T09 | Đề hai cột, tiết kiệm giấy | Dàn trang hai cột thật |
| T10 | Đề Ngoại ngữ có phần đọc hiểu | Đoạn đọc gắn câu hỏi |

Các mẫu là điểm khởi đầu đa môn/lớp. **Số câu và cấu trúc cụ thể từng seed là lựa chọn kỹ thuật của người triển khai**, vì chủ dự án chưa cho con số. `backend/templates/seeds.js` hiện định nghĩa số câu T01–T10 lần lượt là **6, 11, 14, 19, 20, 5, 10, 4, 12, 11**; test phải khóa các giá trị đó. Mẫu gốc read-only về cấu trúc, bản sao mới sửa cấu trúc. Nội dung slot và metadata đề vẫn điền được trên mẫu gốc.

## Yêu cầu dữ liệu và tương tác đã chốt

- Slot/phần có ID ổn định, loại, mức độ, điểm chính xác đến 0,01, đáp án/lời giải, subpart tự luận, vùng trả lời (dòng kẻ, vùng trống, ô ly, bảng, vùng vẽ) và giới hạn min/max dòng.
- Tổng điểm câu/phần/đề được đối chiếu; nhập thủ công hoặc chia tự động; thang mặc định 10 nhưng linh hoạt. AI và import không âm thầm sửa điểm.
- Editor danh sách + bảng thuộc tính, chọn khối từ preview A4; kéo thả đơn giản và nút lên/xuống. Canva chỉ là công cụ bên ngoài tạo PNG/PDF để upload.
- Metadata gồm trường, lớp, môn, chủ đề, năm, học kỳ, thời gian, giáo viên, tài liệu, ghi chú, chỉ dẫn AI; phần lớn tùy chọn.
- Import ưu tiên map bằng stable slot ID; ghép theo thứ tự chỉ là gợi ý có căn cứ. Mơ hồ để người dùng quyết; sửa/tái sinh có diff, xác nhận, Undo; slot không chọn không đổi.
- Ảnh minh họa được upload riêng và gắn câu. AI chỉ có thể ghi placeholder/chú thích text; không tạo ảnh, file hay bố cục.
- Tài nguyên nhị phân lớn tách khỏi Gist; manifest/ref/checksum, cảnh báo thiếu trên thiết bị. Migration additive, đề cũ vẫn mở/sửa/xuất/sync.

## Nhóm prompt và điều kiện chấp nhận

P1 sinh toàn đề; P2 sinh phần/slot chọn; P3 kiểm tra hoặc sửa/tái sinh chọn lọc. Mỗi template có cả ba nhóm trong một khu vực rõ ràng, bộ chọn năm AI và Copy Prompt. Nội dung cập nhật khi cấu trúc, điểm, mức độ, dòng, metadata hoặc hướng dẫn đổi. Quy tắc cú pháp chung và biến thể AI quản lý tập trung.

Chấp nhận khi kiểm chứng thực tế: đúng 10 seed không nhân đôi sau restart; khóa cấu trúc seed và sửa được clone; P1/P2/P3 × 5 AI tạo prompt parse được; nội dung map đúng và giữ slot không chọn; điểm khớp; hai chế độ import có đường duyệt tay; bản HS không lộ đáp án; PDF/DOCX thực mở được, không cắt chữ khi quá trang; T08/T09/T10 có layout thật; archive/sync/Android và luồng cũ không mất dữ liệu. Trạng thái thực thi và bằng chứng test theo `TEMPLATE_SYSTEM_TEST_PLAN.md` cùng file tiến trình của dự án.
