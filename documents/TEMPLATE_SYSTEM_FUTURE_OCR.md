# Roadmap OCR tương lai — không thuộc bản triển khai hiện tại

Quyết định chủ dự án (câu 34 trong `prompt_update.txt`): **không triển khai OCR hiện tại**. Không cài thư viện/binary/model, không tải model, không gọi OCR API, không thêm nút OCR chưa chạy và không quét ngầm. PDF scan hiện chỉ hiển thị/dùng làm nền, cho đánh dấu vùng điền text thủ công và cảnh báo không trích được chữ.

Nếu chủ dự án cho phép ở phiên bản sau, thêm adapter tùy chọn sau bước kiểm tra PDF có lớp text native. Hợp đồng dữ liệu đề xuất: `page raster → { text, bbox, confidence, language }[] → review UI → importer cấu trúc → slot mapper`. Adapter chỉ chạy khi người dùng chủ động chọn; mặc định tắt, không tự tải model, cài hay thiếu plugin đều không ảnh hưởng các chức năng hiện có. OCR không được tự sửa cấu trúc seed hoặc grammar prompt.

Khi đánh giá giải pháp offline (ví dụ Tesseract local hoặc model nội bộ), đo giới hạn trang/DPI/RAM/CPU, timeout, tiến độ, hủy, bộ nhớ tạm và xóa dữ liệu tạm. QA riêng tiếng Việt, công thức, bảng, hai cột, điểm số, đáp án, PDF scan xoay/mờ. Confidence thấp và mọi ánh xạ mơ hồ phải chuyển sang duyệt/sửa tay. Dữ liệu OCR là nội dung chưa tin cậy; kiểm an toàn như text dán và không giả định nó đúng.
