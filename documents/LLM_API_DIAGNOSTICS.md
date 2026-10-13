# Chẩn đoán luồng LLM API cũ

Ngày lập: 11/10/2026. Báo cáo của người dùng: API LLM tự động bị lỗi nhưng chưa có thông báo lỗi, provider/model hay ca tái hiện cụ thể. Không sử dụng key thật và không gọi cloud trong M0; không tuyên bố đã xác định nguyên nhân từ báo cáo chung.

## Dấu vết mã nguồn đã kiểm tra

1. UI `frontend/script.js` tải model qua `POST /api/settings/llm/models`, gửi `POST /api/generate` bằng `model_id` hoặc `provider` + `model_name`.
2. `backend/routes/settingsRoutes.js` lấy key đã lưu nếu request không đưa key, gọi `listModelsFor`; route `/llm/test` gọi `provider.generate('Tra loi ngan gon: OK')`. Key trong `LLM_SETTINGS` không trả toàn bộ qua GET.
3. `backend/routes/generateRoutes.js` lấy model/key, `buildPrompt` từ `Gemini_Prompt_Unified.txt`, gọi provider, parse bằng `TextPromptParser`, retry tối đa 2 lần nếu sai cú pháp; lỗi upstream thành HTTP 502, sai format sau retry thành 422.
4. `OpenAIProvider`, `AnthropicProvider`, `GeminiProvider` dùng `fetch` với timeout 120 giây và endpoint riêng. `ProviderFactory` chỉ hỗ trợ ba hãng đó và local GGUF cho API tự động; năm AI của Copy Prompt là bộ chọn mới, không phải lời hứa API cloud cho DeepSeek/Grok.

## Bằng chứng kiểm thử và giới hạn

`npm test -- --runInBand` tại M0: **27/27 suite, 422/422 test qua**. Các test route/provider dùng mock, chứng minh xử lý trường hợp mô phỏng; không chứng minh key, quyền model, quota, mạng, trạng thái API hãng, phản hồi thật hay cách UI hiển thị lỗi trên máy người dùng. Không đọc/in key từ SQLite hay log. Không có root cause được xác nhận trong M0. Chưa sửa mã API cũ trong nhánh tài liệu này.

## Quy trình tái hiện an toàn cho track M7

Ghi thời điểm, provider, model ID, bước lỗi (`list models`/`test`/`generate`/`parse`), HTTP status và thông báo đã gỡ key/token. Chạy test mocked riêng và tái hiện request cục bộ; nếu được người dùng cấp key hợp lệ qua UI thì smoke thật, không đưa key vào test fixture/log/issue. Đối chiếu lỗi 400 cấu hình, 502 upstream/timeout, 422 parse; nếu list model trả model không hỗ trợ generate, kiểm capability trước khi chọn. Chỉ sửa khi chứng minh được nguyên nhân và thêm regression test. Copy Prompt → AI ngoài → dán text vẫn phải hoạt động dù API cloud lỗi hoặc offline.

## Cập nhật 13/10/2026 — lỗi tìm được từ mã nguồn

- **OpenAI:** `OpenAIProvider.generate` luôn gửi `temperature: 0.7`. `listModels` sắp model mới nhất lên đầu, nên người dùng dễ chọn model reasoning (GPT-5, o-series); các model này chỉ nhận temperature mặc định và trả **HTTP 400** (luồng sinh đề báo lỗi upstream 502). Đã bỏ tham số; `tests/llm/OpenAIProvider.test.js` kiểm body request, lỗi 400 không lộ key và phản hồi rỗng. Đây là nguyên nhân có căn cứ từ hợp đồng API, **chưa xác nhận bằng key thật** của người dùng.
- Anthropic/Gemini: không thấy tham số bị model mới từ chối trong request hiện tại; chưa có bằng chứng lỗi. Nếu vẫn lỗi, cần provider, model ID, bước lỗi và HTTP status (đã gỡ key) theo quy trình phía trên.
- **Anthropic (người dùng báo ngày 13/10/2026):** `HTTP 400 invalid_request_error — "Your credit balance is too low to access the Anthropic API"`. Nguyên nhân là tài khoản hết credit, không phải lỗi mã; cần nạp ở console.anthropic.com → Plans & Billing. UI giờ hiện gợi ý tiếng Việt cho nhóm lỗi này (`backend/llm/errorHint.js`).
- **DeepSeek** được thêm làm provider cloud thứ tư (API tương thích OpenAI); test hợp đồng bằng fetch giả, chưa smoke key thật.
