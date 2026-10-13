# Kế hoạch kiểm thử hệ thống template

Ngày lập: 11/10/2026. Baseline M0 thực chạy trên nhánh `feature/chuan-hoa-cong-thuc-toan-latex`: `npm test -- --runInBand` → **27 suite, 422 test qua, 0 lỗi**, 44,92 giây. Baseline gồm các sửa đổi có sẵn chưa commit; kết quả này không chứng minh template M1–M7 đã hoàn tất.

Sau M4 backend asset/import, siết giới hạn file và render PDF, chạy lại cùng lệnh: **33 suite, 456 test qua, 0 lỗi** (14,70 giây). Sau đợt bổ sung header/footer DOCX theo `appearance` và cảnh báo vùng tọa độ tay, chạy lại: **33 suite, 459 test qua, 0 lỗi** (~7,4 giây, `npm test -- --runInBand`); ba test mới nằm trong `tests/templateExport/templateExport.test.js` (header/footer theo cấu hình, T01 tắt footer, cảnh báo `MANUAL_REGION_NOT_APPLIED`). `tests/routes/backgroundRoutes.test.js` có **9/9 test qua** về upload, từ chối file giả/SVG động, trích DOCX, ZIP khai báo giải nén quá lớn, PDF scan, quá 100 trang/quá 1 MB text, render tối đa 10 trang, fallback khi lỗi và mode. `pdf-parse` được mock trong Jest vì fake worker dynamic import không chạy trong cấu hình CJS. Một smoke trực tiếp với PDF một trang tự tạo và `pdf-parse` thật đã cho `getInfo.total=1`, `getScreenshot` trả PNG 960×1242,35 px, 8.898 byte. DOCX được kiểm tra qua OOXML; PDF xuất từ Chrome được trích text và ảnh chụp preview web được xem trực quan. Chưa mở toàn bộ DOCX/PDF trong ứng dụng đọc tài liệu để duyệt từng trang.

Smoke web thực chạy qua Chrome headless CDP bằng `node tools/smoke-template-ui.cjs` (sau khi chạy `npm start` và Chrome với cổng CDP 9222): gallery có 10 mẫu gốc, prompt sinh từ slot, clone, dán text AI rồi validate/diff/Apply vào slot, lưu điểm, PDF bản học sinh trích được nội dung thử nghiệm và không có lời giải. Ảnh chụp preview được xem trực quan trong phiên làm việc. Smoke này chỉ kiểm T01 và không thay thế ma trận QA đủ 10 mẫu. Test DOCX T09/T10 kiểm OOXML hai cột và đoạn đọc; chưa kiểm mắt toàn bộ trang trong Word/PDF reader.

Android: dùng Gradle 8.14.3 từ cache của máy, chạy `:app:testDebugUnitTest :app:assembleDebug --no-daemon --quiet` thành công ngày 11/10/2026. Báo cáo XML: **3 suite, 5 test, 0 lỗi/skip**; APK debug tạo ở `app/build/outputs/apk/debug/ExamBuilder-debug.apk` (17.509.471 byte). Chưa cài/chạy trên thiết bị hoặc giả lập; kết quả build không chứng minh nền/hai cột parity.

## Cổng kiểm thử theo milestone

| Bước | Kiểm chứng tự động bắt buộc | Kiểm chứng thủ công |
| --- | --- | --- |
| M1 model/seed | Đúng 10 ID/tên/thứ tự, số phần/câu cố định theo manifest, seed idempotent, clone sửa được, điểm 0,01, migration v1 | Mở đề cũ trước/sau migration |
| M2 gallery/editor | UI chọn seed/clone, sửa metadata, reorder chỉ trên clone, preview chọn khối, lưu/mở | Bàn phím, theme, màn hình hẹp, drag/up-down |
| M3 prompt/map | P1/P2/P3 × 5 AI, prompt đổi theo revision/metadata, parser v1/v2, thiếu/thừa/trùng ID, điểm lệch, diff/Undo, XSS | Copy qua AI ngoài, dán text hợp lệ, sửa chọn lọc không đổi câu khác |
| M4 asset/import | MIME thực, giới hạn file, ảnh/SVG nguy hiểm, DOCX/PDF native text, scan fallback, thiếu asset | Hai chế độ import, vùng thủ công, ảnh nền trang đầu/giữa/cuối |
| M5 export | HS/GV/key/combined, A4/A5, dọc/ngang, lề, header/footer, số trang, auto/max cảnh báo, T08/T09/T10 | Mở DOCX bằng ứng dụng/OOXML validator và PDF bằng reader/rasterizer; xem trang thật, không lộ đáp án HS |
| M6 sync/Android | v1/v2 round-trip, Gist không chứa binary, checksum/fallback, Kotlin DTO/merge fixtures, Gradle build/test nếu SDK có | Offline với asset có/thiếu/quá lớn, mở/xem/xuất Android |
| M7 regression | Toàn bộ Jest, negative/security, LLM mocked/provider, E2E từ chọn mẫu → dán → xuất → mở lại | Smoke mười seed và mọi biến thể; tài liệu giới hạn thực tế |

## Bằng chứng bổ sung ngày 12/10/2026

- DOCX chứa manual region và nền riêng hai trang đã được Microsoft Word mở/chuyển PDF thật; raster kiểm trực quan cho thấy hai nền khác nhau, nội dung câu ở đúng X/Y trên mỗi trang. Slot tràn vùng quay lại luồng văn bản thường và phát cảnh báo; slot overlay nằm trong ảnh trong suốt có alt text, nên không sửa trực tiếp như đoạn Word.
- PDF 14 trang tạo bằng Word được gửi qua `/api/backgrounds/import`; API trả đủ 14 PNG 960×1358, tổng 184.673 byte cùng asset ID/SHA-256/MIME. Test PDF vượt 100 trang giữ file gốc và trả manifest/fallback để tải xuống thay vì cắt file.
- `maxPages=1` với tài liệu hai trang tạo cảnh báo ước lượng, vẫn giữ cả hai trang sau Word render. Phân trang DOCX/PDF vẫn phụ thuộc Word/trình duyệt khi người dùng in; estimate không đảm bảo số trang tuyệt đối trên mọi máy/font.
- DOCX import-as-background cần Microsoft Word trên Windows. Trường hợp không có Word/lỗi được test fallback; Windows smoke thật đã chạy. Linux/macOS không raster DOCX và dùng fallback tải file gốc.
- Export smoke đã đọc lại DOCX thật cho cả 10 seed ở 4 chế độ (student/teacher/answer_key/combined). `npm test -- --runInBand` đạt **33 suite, 478 test**.
- Asset binding tạo manifest SHA-256, role, page number, `reference_only`, fallback; ảnh nhị phân không đi theo Gist. Android báo số tài nguyên tham chiếu ngoài khi render layout cơ bản.
- Benchmark DOCX 500 slot trong môi trường hiện tại: 15.546 byte, 85 ms; đây không phải cam kết hiệu năng trên mọi máy.
- Android Gradle 8.14.3 `:app:testDebugUnitTest :app:assembleDebug --no-daemon --quiet` thành công; 3 suite, 5 test, 0 lỗi. `adb devices -l` không có thiết bị kết nối nên QA thao tác thật chưa làm.
- Emulator Android mở được app tới màn Soạn đề; chưa chạy QA đủ mẫu vì smoke đó chỉ kiểm khởi động. Thiết bị thật chưa có.
- Regression cuối: `npm test -- --runInBand` — **33 suite, 478 test qua, 0 lỗi**.

## Bằng chứng rà soát ngày 13/10/2026

- `npm test -- --runInBand`: **35 suite, 490 test qua, 0 lỗi** (thêm `tests/parser/examRedaction.test.js`, `tests/llm/OpenAIProvider.test.js`, test P3, test DOCX LaTeX/Đúng-Sai/điểm phần, kiểm pixel ảnh nền làm nhạt và WebP, test link chia sẻ không lộ đáp án).
- Smoke Chrome headless trên server cổng 3456 với `EXAM_DB_PATH`/`EXAM_BACKGROUNDS_DIR`/`EXAM_TEMPLATE_ASSETS_DIR` tạm (không đụng dữ liệu thật): `tools/smoke-template-ui.cjs` đạt; smoke riêng kiểm lọc gallery, thiết lập trang, chia điểm, `is_correct` khi chuyển sang trình soạn đề, hành động P3, link chia sẻ không có lời giải. Ảnh preview T09 có nền 0,12 đã xem.
- Chưa chạy: vùng tọa độ tay trên PDF nền thật trong trình duyệt; DOCX mở bằng Word cho các thay đổi lần này (chỉ đọc OOXML/mammoth); Android không đổi mã nên không chạy lại Gradle.

## Fixture tối thiểu

- Một đề cho mỗi T01–T10 với manifest count; T08 có vùng lời giải nhiều dòng, T09 hai cột thật, T10 đoạn đọc và câu hỏi gắn đoạn.
- V1 đề đang lưu và text prompt cũ; v2 đầy đủ, v2 partial, ID sai/trùng, sai loại, sai điểm, thiếu đáp án/lời giải, chữ HTML/script, công thức LaTeX.
- Điểm lẻ 0,01 với tổng chính xác; subparts a/b/c; trang vượt MAX-PAGES; nền đầu/giữa/cuối; asset thiếu/checksum sai.
- DOCX có đoạn/bảng/ảnh, PDF native text, PDF scan không có text, SVG nguy hiểm, file giả MIME và quá lớn.
- Gist/library hai thiết bị với đề v1/v2, tombstone, thiếu binary; Kotlin đọc cùng JSON fixture.

## Ma trận QA thủ công

Với **mỗi T01–T10**, xác nhận tên, count/structure gốc sau restart, điền slot, clone rồi sửa, xem HS/GV, xuất PDF/DOCX và mở lại. Với **mỗi nhóm P1/P2/P3** chọn lần lượt **ChatGPT, Claude, Gemini, DeepSeek, Grok**; kiểm prompt cập nhật theo điểm/số dòng/chủ đề, Copy Prompt, dán phản hồi hợp lệ và không hợp lệ. Riêng P2/P3 xác nhận các slot ngoài selection giữ nguyên; P3 kiểm diff, Cancel, Apply, Undo. Kiểm cả bản key riêng/gộp, nền in và nhiều mã đề.

Chạy `npm test -- --runInBand` sau mỗi milestone và ghi số thật vào file tiến trình. Chỉ báo pass khi đã chạy; nếu thiếu Android SDK hoặc ứng dụng đọc/raster PDF, ghi rõ bước bỏ qua và lệnh/thiết bị cần thiết. Không coi parser unit test là bằng chứng file xuất nhìn đúng.
