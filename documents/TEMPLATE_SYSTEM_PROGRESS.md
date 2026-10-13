# Tiến trình Template System

Cập nhật: 2026-10-13 · Nhánh `feature/chuan-hoa-cong-thuc-toan-latex`

Quy ước: `[ ]` chưa hoàn tất, `[x]` đã triển khai và kiểm chứng. Không đánh dấu hoàn tất khi chưa có bằng chứng chạy test phù hợp.

## M0 — Khảo sát và nền tảng

- [x] Đọc `prompt_update.txt`, kiểm tra nhánh và thay đổi chưa commit; giữ nguyên công việc hiện có.
- [x] Chạy test nền: 27 suites, 422 tests đạt (`npm test -- --runInBand`).
- [x] Ghi PRD/kiến trúc, hợp đồng dữ liệu, migration, kế hoạch test trong `documents/`.
- [x] Ghi chẩn đoán luồng LLM API cũ; lỗi dùng credential thật chưa tái hiện được từ báo cáo thiếu triệu chứng cụ thể.

## M1 — Domain và kho template

- [x] Schema có phiên bản, validator, đúng 10 seed bất biến với ID và số slot ổn định.
- [x] Clone tùy chỉnh, CRUD, lưu SQLite additive, kiểm điểm; sau M1 có 30 suites, 433 tests đạt.

## M2 — Web gallery và editor

- [x] Gallery, editor danh sách/inspector, preview chọn slot, clone, lên/xuống, lưu bản tùy chỉnh; smoke Chrome headless kiểm gallery, prompt, clone và lưu điểm.
- [x] Metadata, kiểm điểm so với thang điểm, vùng trả lời, A4/A5/chiều giấy, preview HS/GV/đáp án và thao tác thay thế drag bằng nút lên/xuống.

## M3 — Prompt và ánh xạ AI

- [x] Nguồn prompt tập trung, P1/P2/P3 và 5 AI, prompt động theo slot; HTTP build trả đúng 6 slot T01.
- [x] Dán text, parse/validate, diff, xác nhận Apply và Undo, bảo toàn slot khác; test module đạt và smoke trình duyệt đi qua validate/diff/Apply.

## M4 — Tài nguyên và import

- [x] Thư viện nền, upload PNG/JPG/WebP/SVG an toàn, lưu asset; DOCX/PDF trích text native, gợi ý cấu trúc để duyệt.
- [x] PDF import-as-background raster tối đa 100 trang đầu thành PNG có giới hạn tổng 12 MiB; PDF thật 14 trang raster đủ ảnh, PDF quá 100 trang vẫn giữ file gốc + manifest/fallback.
- [x] DOCX cảnh báo khi slot manual region thiếu nền; vùng hợp lệ được đặt bằng overlay PNG, nội dung quá vùng được chuyển lại luồng văn bản editable để không cắt.
- [x] DOCX import-as-background chuyển qua Microsoft Word trên Windows sang PDF rồi PNG; khi Word thiếu/lỗi, giữ file gốc và cảnh báo rõ để tải xuống/đánh dấu thủ công.
- [x] Vùng tọa độ tay áp theo từng trang DOCX; PDF raster đến 100 trang trong ngân sách; manifest gồm checksum/vai trò/page number, binary không đưa vào Gist và fallback giữ nội dung khi thiếu asset.
- [x] Chỉ tài liệu hóa OCR tương lai; không cài hoặc gọi OCR.

## M5 — Xuất và phân trang

- [x] DOCX cho HS/GV/đáp án, A4/A5, chiều giấy, lề, số trang, hai cột T09 và đoạn đọc T10; test đọc DOCX/OOXML thật.
- [x] Nhúng PNG/JPEG đã quản lý làm nền trang đầu/mọi trang và ảnh slot trong DOCX, kiểm checksum/size.
- [x] Header/footer DOCX theo `appearance.header/footer` (enabled + fields) và metadata; test OOXML xác nhận tiêu đề trường/đề xuất hiện, số trang có mặt, và T01 tắt footer thì không còn số trang.
- [x] In/Lưu PDF qua Chrome headless: PDF học sinh có đủ text câu thử nghiệm và không chứa lời giải; UI screenshot đã xem.
- [x] WebP/SVG nền và ảnh slot chuyển PNG có giới hạn kích thước rồi nhúng DOCX; kiểm tra OOXML xác nhận bytes PNG thật.
- [x] Nền trang đầu/mọi trang và cảnh báo giới hạn `BACKGROUND_SCOPE_LIMIT` rõ ràng khi cấu hình nền giữa/cuối trên một ảnh duy nhất; hỗ trợ đầy đủ khi có manifest trang.
- [x] MAX-PAGES cảnh báo theo ước lượng và không cắt; Word render smoke hai trang với maxPages=1 xác nhận cảnh báo xuất hiện, đủ hai trang/nội dung.

## M6 — Lưu trữ, đồng bộ, Android

- [x] Snapshot `template_binding`, archive và sync tương thích cũ, không đưa binary lớn vào Gist; test round-trip đạt.
- [x] Android giữ binding, hiển thị điểm/ngữ liệu/vùng trả lời, áp khổ/chiều/lề xuất file; `testDebugUnitTest` 5/5 đạt và `assembleDebug` tạo APK debug.
- [ ] Nền/hai cột Android và kiểm thử trên thiết bị thật chưa xác minh.

## M7 — Hoàn thiện

- [x] Regression JavaScript 33 suites/478 tests đạt (`npm test -- --runInBand`); smoke export đủ 10 seed × 4 chế độ; smoke Chrome trước đó kiểm gallery/prompt/dán AI/clone/PDF học sinh; lượt này kiểm DOCX/PDF nhiều trang qua Word và 14 trang PDF import.
- [x] Thêm `aria-live="polite"` cho vùng trạng thái template; các nút/nhãn đã có text hoặc `aria-label`.
- [x] Benchmark đề 500 slot: DOCX 15.546 byte, 85 ms trong môi trường này; seed/export coverage chạy qua regression.
- [ ] QA thủ công đủ 10 mẫu/chế độ trên Android thật cần làm; hiện ADB không có thiết bị kết nối.

## Đợt rà soát 13/10/2026 — kiểm lại tính năng đã làm

Kiểm lại code M1–M7 với `prompt_update.txt`; các lỗi dưới đây tìm thấy và đã sửa, có test hồi quy.

- [x] **Sai đáp án sau khi xáo** (nghiêm trọng): inspector chỉ tính `is_correct` lúc sửa lựa chọn; nhập lựa chọn trước rồi đáp án sau làm mọi `is_correct=false`, nên khi "Mở trong trình soạn đề" (có xáo A–D) đáp án giữ chữ cũ. Nay `is_correct` luôn suy ra từ `correct_answer`, và việc chuyển sang trình soạn đề bị chặn nếu đáp án TN không trùng A/B/C/D. Smoke Chrome: 4/4 câu TN `correct_answer = C` khớp `is_correct`.
- [x] **Link chia sẻ lộ đáp án**: `?data=` và `GET /api/exams/shared/:code` trả cả `correct_answer`, `explanation`, `is_correct`, `template_binding`. Thêm `backend/parser/examRedaction.js` dùng chung trình duyệt/server; bản lưu của giáo viên giữ nguyên. Test route + smoke link thật.
- [x] **Chọn slot tự gán vùng tọa độ** khi template có trang nền PDF (vùng mặc định 10%/10% → DOCX đặt chồng mọi câu đã xem lên cùng chỗ). Nay phải bấm "Gắn vùng trên trang nền", có nút "Bỏ vùng". *Chưa smoke bằng PDF nền thật trên trình duyệt.*
- [x] **Ảnh WebP trong DOCX ra PNG trong suốt**: `@napi-rs/canvas` 0.1.100 giải mã ảnh raster bất đồng bộ; `rasterize()` vẽ trước khi giải mã xong. Thêm `await image.decode()`; test cũ chỉ kiểm chữ ký PNG nên đã bổ sung kiểm pixel.
- [x] **Preview che mất nền**: slot có `background: white !important`. Nền vẽ qua lớp `::before` theo `opacity`/`fit`; DOCX làm nhạt sẵn ảnh nền đơn theo `opacity` (cảnh báo `BACKGROUND_OPACITY_BAKED`).
- [x] **P3 thiếu hành động** tăng/giảm độ khó, cải thiện lời giải, đổi diễn đạt giữ đáp án (đặc tả P3). Prompt ghi `Muc_Do` mới; validator chấp nhận mức mới chỉ với hai hành động đổi độ khó; `improve-solution`/`restyle-keep-answer` báo `ANSWER_CHANGED` nếu AI đổi đáp án. Hành động lạ bị từ chối.
- [x] **Chia điểm tự động** (câu 18): nút "Chia đều điểm theo thang điểm đề", đơn vị 0,01, phần dư cộng vào các câu cuối. Smoke: 7 điểm/6 câu → 1.16, 1.16, 1.17 ×4.
- [x] **Thiết lập trang thiếu trên UI** (lề, số cột, header/footer, độ đậm và phạm vi nền) cho bản sao tùy chỉnh.
- [x] **DOCX template**: LaTeX làm phẳng bằng `latexToPlainText` như exporter cũ (trước ra `$\sqrt{16}$` thô); câu Đúng/Sai có ô ☐ và đáp án "Đúng/Sai"; tiêu đề phần ghi điểm phần; trang đầu `titlePage` không còn mất số trang.
- [x] **LLM API (OpenAI)**: luôn gửi `temperature: 0.7`, trong khi danh sách model xếp mới nhất trước (GPT-5/o-series) — các model reasoning này trả HTTP 400 với temperature khác mặc định. Đã bỏ tham số; test hợp đồng request bằng fetch giả. Chưa smoke với key thật.
- [x] Nhỏ: thêm sau khi clone đúng phần đã bấm (trước luôn vào phần 1); không cho xóa câu cuối của một phần; lọc gallery Mẫu gốc/Mẫu của tôi, tìm theo mô tả/môn; `/backgrounds` tĩnh dùng cùng `EXAM_BACKGROUNDS_DIR` với route upload; bỏ thông báo cũ "Word chưa nhúng ảnh".
- [x] Kiểm chứng: `npm test -- --runInBand` **35 suite, 490 test đạt**; `npm run gen:prompt` không làm đổi module sinh; `tools/smoke-template-ui.cjs` đạt trên DB/thư mục asset tạm; smoke riêng cho các lỗi trên đạt; ảnh preview nền 0,12 + hai cột T09 đã xem.
- [ ] Còn mở: điểm câu chưa hiện trong trình soạn đề/xuất file cũ sau khi "Mở trong trình soạn đề"; nền/hai cột Android và QA thiết bị thật (như trên).

## Đợt 2 ngày 13/10/2026 — theo phản hồi của chủ dự án

- [x] Mở từ mẫu sang trình soạn đề **giữ nguyên thứ tự A–D**; thêm nút **🔀 Xáo trộn đáp án** (nhãn A B C D giữ thứ tự, đáp án đúng đi theo nội dung). `shuffleMCQOptions` tự suy `is_correct` từ `correct_answer` khi dữ liệu nhập (JSON) thiếu, tránh sai đáp án. Smoke: 4 lần xáo, nhãn luôn ABCD, phương án đúng luôn là nội dung `DUNG_x`.
- [x] **Điểm từng câu/phần** hiện ở trình soạn đề, bản in PDF và Word cũ khi câu có `points` (đề cũ không có điểm thì không hiện).
- [x] **Link chia sẻ dùng được trên máy khác cùng Wi-Fi/LAN**: `GET /api/network-info` trả IP LAN (`backend/network.js`); khi mở app bằng `localhost`, link dùng IP LAN và hiện hướng dẫn tường lửa. Khác mạng (4G, nhà khác) **chưa hỗ trợ** — cần tunnel/hosting.
- [x] **Tab "Tải file" nhận PDF**: `POST /api/resources/extract-pdf-text` trích lớp chữ; PDF có chữ được parse như .txt. PDF scan (vd `Math9-1.pdf`: 123 trang ảnh, 0 chữ) được báo rõ, **không OCR**, kèm nút copy prompt nhờ AI ngoài đọc PDF và chuyển sang đúng định dạng. File .docx/.txt/PDF có chữ nhưng sai cấu trúc cũng có nút này (prompt kèm nội dung).
- [x] **DeepSeek API**: `DeepSeekProvider` (tương thích OpenAI, `https://api.deepseek.com`, `max_tokens` 8192, chờ 300 s); danh sách hãng tập trung ở `backend/llm/providerIds.js`; migration idempotent dựng lại `LLM_SETTINGS`/`LLM_MODEL` để CHECK nhận `deepseek` mà giữ key/model cũ. Ô key DeepSeek trong Cài đặt. **Chưa thử với key DeepSeek thật.**
- [x] Lỗi API có **gợi ý tiếng Việt** (`backend/llm/errorHint.js`): hết credit, sai key, 403, 404, 429, timeout, mất mạng; vẫn giữ chi tiết gốc. Lỗi Anthropic của người dùng là *"credit balance is too low"* — tài khoản hết credit, không phải lỗi code.
- [x] Kiểm chứng: `npm test -- --runInBand` **38 suite, 501 test đạt**; smoke Chrome (DB tạm, cổng 3456) đạt 12/12 mục: ô DeepSeek, lưu key, PDF scan thật, thứ tự A–D, điểm câu/phần, nút xáo, link IP LAN mở được qua `http://10.11.152.147:3456`.

## Ghi chú

- Cập nhật 12/10/2026: thêm `@napi-rs/canvas` trực tiếp để DOCX raster hóa WebP/SVG an toàn (tối đa 20 MP, cạnh 10.000 px, cạnh PNG đầu ra 2.400 px, đầu ra tối đa 5 MiB). Test OOXML kiểm bytes PNG nhúng.
- Cập nhật 12/10/2026: DOCX background dùng Microsoft Word COM tùy chọn trên Windows để tạo PDF tạm rồi tái sử dụng rasterizer PDF. Test API giả lập đường thành công và fallback.
- Cập nhật 12/10/2026: Word smoke hai trang được raster và xem trực quan: nền riêng từng trang, nội dung overlay đúng tọa độ; 14 trang PDF thật nhập thành 14 ảnh (184.673 byte). `npm test -- --runInBand`: **33 suites, 478 tests passed**. Android Gradle 8.14.3 unit test + assembleDebug đạt (5 tests); emulator smoke vào màn Soạn đề, chưa kiểm đủ template trên thiết bị thật.

- Số slot trong 10 seed là quyết định kỹ thuật cần ghi rõ trong manifest/test, không phải con số do chủ dự án cung cấp.
- Không triển khai OCR, không gọi AI sinh ảnh, không tích hợp Canva API.
- Mọi thay đổi chưa commit trước khi bắt đầu phải được bảo toàn.

## Sự cố 13/10/2026 — server tắt khi khởi động

- [x] `SQLITE_ERROR: cannot start a transaction within a transaction` lúc chạy `Chay_ExamBuilder.bat` lần đầu sau khi thêm DeepSeek: `getDb()` gán kết nối trước khi migration xong, request của trình duyệt mở transaction chồng lên migration, lỗi không được bắt nên Node thoát. Sửa: `getDb()` giữ promise khởi tạo để mọi request chờ schema + migration xong; `server.js` ghi log `unhandledRejection` thay vì thoát. DB thật không bị đổi do transaction rollback (đã kiểm chỉ đọc). Kiểm trên bản sao DB thật với 10 request đồng thời lúc khởi động: tất cả 200, migration hoàn tất, giữ key/model/15 đề. Test `TC-DB-MIG-02`; `npm test` 38 suite / 502 test đạt.

## Đợt 3 ngày 13/10/2026 — nền PDF, thư viện tài liệu, yêu cầu sinh đề

- [x] **Khung "Nền PDF" có nút ⬆️ Tải ảnh nền**: ảnh PNG/JPG/WebP/SVG lưu vào `resources/backgrounds` qua `/api/backgrounds/upload`; PDF/Word thì mỗi trang thành một ảnh nền (`/api/backgrounds/import`, `mode=background`), tự chọn trang 1. Dropdown hiện tên file gốc thay mã băm; ảnh trang PDF đặt tên "<tên file> - trang N". Tải xong tự bật "Nền PDF".
- [x] **Thư viện tài liệu**: bảng mới `RESOURCE_HISTORY` (additive, không khóa ngoại nên giữ lịch sử khi tài liệu bị xóa, giữ 200 dòng mới nhất); `GET /api/resources/history`. Giao diện có mục "Tài liệu hiện có" kèm tên từng phần, "Lịch sử cập nhật" ở cuối, thông báo 5 giây khi tạo tài liệu/thêm phần/tải file/xóa, hỏi xác nhận trước khi xóa. Tải PDF scan vào thư viện báo rõ không có OCR.
- [x] **Yêu cầu sinh đề tự động**: prompt sẵn có giữ nguyên, yêu cầu viết tay ghép vào cuối; bảng số câu thu gọn mặc định (bấm mũi tên mới mở), tiêu đề cho biết đang trống hay đang đặt bao nhiêu câu; bảng không còn bắt buộc. Quy tắc: bảng có số → quyết cấu trúc (số câu/loại/mức độ) và đặt cuối prompt; yêu cầu viết tay dùng cho chủ đề, dạng bài, phong cách, nếu nêu số câu khác bảng thì theo bảng; bảng trống → yêu cầu viết tay được quyết cả số câu; cả hai trống → số câu mặc định của prompt. UI hỏi xác nhận khi cả hai cùng nêu cấu trúc. Server đếm số câu AI trả theo loại × mức độ, lệch bảng thì nhắc AI sửa (chung giới hạn 3 lần gọi), lần cuối vẫn lệch thì trả đề kèm `spec_warnings`; bảng không hợp lệ trả 400.
- [x] Kiểm chứng: `npm test -- --runInBand` **38 suite, 509 test đạt**; smoke Chrome (DB/thư mục nền tạm) đạt 15/15: tải ảnh nền và tự chọn tên gốc, toast còn ở 3,5 s và tắt sau ~5 s, danh sách phần, lịch sử, bảng thu gọn, cảnh báo xung đột, không cảnh báo khi yêu cầu chỉ nói phong cách.
- [x] Thông báo lỗi chung (`#errorMessage`) tự xóa khi chuyển tab và sau 2 phút (`ERROR_AUTO_CLEAR_MS`); lỗi mới đặt lại hẹn giờ. Smoke Chrome: lỗi ở tab "Sinh đề tự động" mất khi sang "Dán văn bản"; hẹn giờ 120000 ms xóa lỗi (giả lập thời gian).

## Đợt 4 ngày 13/10/2026 — xem nền, bảng sinh đề, AI hỏi lại

- [x] **Xem ảnh nền + cách đặt không cần AI**: nút "👁 Xem nền" mở trang A4 mẫu có dấu tâm trang; chọn "Phủ kín trang (cắt quanh tâm)" hoặc "Giữ nguyên cả ảnh (đặt giữa)"; tâm ảnh luôn trùng tâm tờ giấy khi in; hiện kích thước ảnh và % bị cắt/trống. Sửa lỗi xóa ô chọn file trước khi gửi (Chrome đọc file lúc fetch). Smoke: ảnh 800×300 → "cắt khoảng 73% chiều ngang ảnh", chữ ở tâm ảnh trùng dấu tâm trang.
- [ ] **Ghép nền bằng AI** (họa tiết/theme tĩnh, động, cân xứng): CHƯA làm — trái quyết định "AI không sinh ảnh/nền" (Phần I.4, câu 10, checklist 12) và cần API ảnh riêng; chờ chủ dự án quyết.
- [x] **Bảng sinh đề tự động**: bấm tab "Sinh đề tự động" mở bảng lớn (form trái; nút sinh, thanh tiến độ, bước, hỏi đáp AI phải). `POST /api/generate/jobs` + `GET /api/generate/jobs/:id` báo stage/lần thử/thời gian; `POST /api/generate` giữ nguyên. Ô "Tên đề": đề mới không còn mang tên đề cũ (trống → "Đề kiểm tra – <chủ đề>").
- [x] **AI hỏi lại người dùng**: bật "Cho AI hỏi lại khi thiếu thông tin" → prompt thêm luật khối `[HOI_NGUOI_DUNG]...[/HOI_NGUOI_DUNG]` (tối đa 3 câu hỏi); route trả `needs_input` + câu hỏi; người dùng trả lời bằng text hoặc "Bỏ qua, cứ ra đề"; tối đa 2 vòng, vòng cuối prompt cấm hỏi thêm. Tắt công tắc thì giữ hành vi cũ.
- [x] Kiểm chứng: `npm test -- --runInBand` **39 suite, 514 test đạt** (thêm `tests/routes/generateJobs.test.js`); smoke Chrome với API OpenAI giả lập (`node -r fake-openai.cjs`, không gọi mạng): 7/7 — mở bảng khi bấm tab, thanh tiến độ, câu hỏi AI hiện ra, trả lời rồi sinh tiếp, tên đề mới "Đề kiểm tra – Căn bậc hai", 2 câu.

## Đợt 5 ngày 13/10/2026 — dừng/hủy, xem trước + lưu, tài liệu kiểu RAG, lỗi DeepSeek

- [x] **Lỗi DeepSeek "phan hoi khong chua noi dung"** (người dùng gặp sau 115 giây): `deepseek-reasoner` tính cả phần suy luận vào `max_tokens`; giới hạn 8192 làm model nghĩ hết trước khi viết đề. Reasoner nay dùng 32768 (deepseek-chat giữ 8192); khi `finish_reason=length` báo rõ nguyên nhân và gợi ý. Chưa thử với key DeepSeek thật.
- [x] **Dừng / Hủy**: `POST /api/generate/jobs/:id/cancel` (`mode=stop|cancel`) cắt request AI đang chờ qua `AbortSignal` (OpenAI/DeepSeek/Anthropic/Gemini; model local thì bỏ kết quả). Có bảng xác nhận "Bạn có muốn dừng/hủy không?". Dừng giữ yêu cầu để "Tiếp tục" (sinh lại từ đầu); Hủy (kể cả sau khi Dừng) xóa sạch tiến độ, câu hỏi AI, đề xem trước. Đóng bảng thì việc sinh đề vẫn chạy; xong tự mở lại bảng.
- [x] **Xem trước đề + 💾 Lưu**: đề sinh xong hiện trong bảng (sửa/xóa câu được), chưa vào trình soạn đề/Lịch sử cho tới khi bấm "Lưu đề"; có "Sinh lại" và "Bỏ đề này" (đều hỏi xác nhận).
- [x] **Tài liệu kiểu RAG** (`backend/llm/contextRetriever.js`): AI đọc các phần được tick, hoặc toàn bộ tài liệu khi bỏ tick hết (gửi `doc_id`); tổng ≤ ~60.000 ký tự thì gửi nguyên văn, dài hơn thì cắt đoạn ~1.200 ký tự, chấm điểm TF-IDF theo chủ đề + yêu cầu (khớp cả có dấu/không dấu), lấy đoạn liên quan nhất trong ngân sách, giữ thứ tự gốc. Prompt dặn đọc kỹ toàn bộ và kết hợp với yêu cầu/bảng. Bảng xem trước ghi AI đã đọc bao nhiêu.
- [x] Kiểm chứng: `npm test -- --runInBand` **40 suite, 521 test đạt**; smoke Chrome với API giả lập tôn trọng hủy: 10/10 (Dừng → Tiếp tục/Hủy, Hủy khi đang chạy không hiện kết quả muộn, đóng bảng vẫn chạy, xem trước chưa ghi vào trình soạn đề, RAG đọc toàn bộ, Lưu vào trình soạn đề + Lịch sử) và luồng AI hỏi → trả lời → xem trước.
