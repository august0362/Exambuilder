# Đặc tả prompt và cú pháp text template

Ngày lập: 11/10/2026. Hợp đồng `template-text-v1` đã triển khai trong adapter template; parser v1 cũ giữ nguyên cho đề lịch sử.

## Nguồn tập trung

`Gemini_Prompt_Unified.txt` là nguồn cú pháp v1; `backend/llm/promptBuilder.js` trích quy tắc cho API. `AI_Prompts_Variants.txt` chứa gợi ý biến thể cũ, sinh `frontend/promptVariants.js`; `tools/gen-prompt-module.js` sinh `frontend/promptTemplate.js`. Sửa `.txt` nguồn cũ rồi chạy `npm run gen:prompt` và test; không sửa hai module sinh tay. Composer template mới đã tập trung quy tắc/registry năm selector trong `backend/templatePrompts/rules.js`, logic sinh và chuẩn bị áp dụng trong `backend/templatePrompts/index.js`; Gemini Pro có thể nằm trong Gemini. API tự động cũ vẫn theo provider cũ.

## Cú pháp hiện có và phần mở rộng

`TextPromptParser.js` hiện hiểu `=PHAN_...=`, `[CAU_HOI]`, `Loai`, `Muc_Do`, `De_Bai`, lựa chọn `A.`–`D.`, `Dap_An`, `Loi_Giai`, `So_Dong_Nhap`. Loại: `TN`, `DUNG_SAI`, `DIEN_TU`, `TU_LUAN`; mức: `Nhan_Biet`, `Thong_Hieu`, `Van_Dung`, `Van_Dung_Cao`. Parser trả `blocks[]`, không giữ ID phần/slot, điểm và chưa bắt buộc lời giải. Các nhãn `Ma_Khung`, `Ma_Phan`, `Diem` trong `prompt_update.txt` **chưa được parser v1 đọc**. V2 phải parse/validate chúng trước khi ánh xạ; giữ nguyên v1 cho dán đề cũ.

Định dạng template hiện thực (`template-text-v1`): header `=PHAN_1=`, `=PHAN_2=` theo thứ tự phần; mỗi `[CAU_HOI]` có `Ma_Khung: <stable slot ID>`, `Ma_Phan: <stable section ID>`, `Diem: <decimal 0.01>`, rồi các trường v1. `So_Dong_Nhap` phải bằng cấu hình slot hoặc được kiểm báo sai; metadata về vùng trả lời vẫn do template giữ. `backend/templatePrompts/index.js` tách metadata rồi dùng parser v1 cho nội dung; lỗi có vị trí/ID, điểm không đổi theo AI, câu dư/thiếu được báo. P3 validate-only dùng JSON báo cáo schema riêng, không lẫn đầu ra câu hỏi.

```text
=PHAN_1=
[CAU_HOI]
Ma_Khung: builtin.t01.s01.q001
Ma_Phan: builtin.t01.s01
Diem: 0.50
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: 2 + 2 bằng bao nhiêu?
A. 3
B. 4
C. 5
D. 6
Dap_An: B
Loi_Giai: 2 + 2 = 4.
So_Dong_Nhap: 0
```

Đây là ví dụ cú pháp của composer mới, rút gọn từ slot đầu T01; câu hỏi minh họa không phải nội dung seed. Ma_Khung/Ma_Phan phải trùng ID thực trong template được chọn. Đáp án và lời giải đầy đủ là bắt buộc ở đầu ra; subparts a/b/c cùng điểm/đáp án/lời giải riêng vẫn cần kiểm nghiệm theo trạng thái triển khai.

## Ba nhóm prompt động

- **P1 Full:** liệt kê chính xác mọi section/slot, ID, loại, mức, điểm, vùng dòng, tổng điểm và metadata; yêu cầu chỉ xuất text theo grammar v2, không thêm/bớt câu.
- **P2 Partial:** chỉ liệt kê ID chọn, không lặp hoặc thay slot khác; cùng grammar và điểm cố định.
- **P3 Review:** với `validate-only`, trả báo cáo cấu trúc riêng; với sửa/tái sinh, chỉ trả khối câu được chọn và giữ ID/điểm. UI xem diff rồi Apply/Cancel/Undo.
  Hành động P3 (`REPAIR_INTENTS` trong `backend/templatePrompts/rules.js`): `rewrite-one`, `regenerate`, `increase-difficulty`, `decrease-difficulty`, `improve-solution`, `restyle-keep-answer`, `validate-only`. Chỉ hai hành động đổi độ khó được đổi `Muc_Do` (lên/xuống đúng một mức, prompt ghi mức mới, validator đối chiếu mức mới); `improve-solution` và `restyle-keep-answer` báo lỗi `ANSWER_CHANGED` nếu AI đổi đáp án. Hành động khác danh sách bị từ chối.

Mọi nhóm cho phép chỉ dẫn thêm/preset của giáo viên nhưng không được làm yếu quy tắc ID, điểm, số câu và text-only. Biến thể AI chỉ thêm mẹo độ tin cậy; không thay schema. Chủ đề, môn/lớp, độ khó, số dòng và revision lấy từ trạng thái template hiện thời mỗi lần xem/copy. AI không tạo ảnh, nền, Word/PDF hay layout. Ảnh cần thiết chỉ ghi placeholder text để giáo viên upload độc lập.

## Ánh xạ và lỗi

Đầu vào không tin cậy. Parse → validate cú pháp/đủ đáp án, lời giải → đối chiếu ID, loại, điểm, selection → đưa diff. ID khớp là ưu tiên. Thiếu ID chỉ gợi ý theo thứ tự nếu cùng phần/loại và không mơ hồ; mọi trường hợp mơ hồ yêu cầu người dùng chọn. Không ghi đè slot không chọn, không nhập câu thừa, không sửa điểm từ AI. Xem trước bằng text an toàn; không đưa HTML thô từ AI vào DOM. Công thức đi qua pipeline toán hiện có.
