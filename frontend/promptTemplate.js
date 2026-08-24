// Noi dung prompt dung chung voi Gemini_Prompt_Unified.txt o goc du an.
// Tach rieng thanh module de khu "Prompt mau cho AI" trong UI co the hien
// thi va copy 1-click ma khong can goi server doc file tinh ngoai frontend/.
export const EXAM_PROMPT_TEMPLATE = `Bạn là chuyên gia khảo thí và biên soạn đề kiểm tra. Hãy tạo nội dung đề thi theo chủ đề [NHẬP MÔN HỌC/CHỦ ĐỀ Ở ĐÂY] tuân thủ CHÍNH XÁC định dạng cấu trúc dưới đây để phần mềm tự động phân tích. Bắt buộc tạo đủ cả 4 loại câu hỏi: TN, DUNG_SAI, DIEN_TU, TU_LUAN.

=PHAN_1_TRAC_NGHIEM=
[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: Nội dung câu hỏi trắc nghiệm 4 đáp án...
A. Lựa chọn A
B. Lựa chọn B
C. Lựa chọn C
D. Lựa chọn D
Dap_An: A
Loi_Giai: Giải thích chi tiết cho đáp án đúng tại đây.

[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Thong_Hieu
De_Bai: Nội dung câu hỏi đúng sai...
Dap_An: Dung
Loi_Giai: Giải thích tại sao đúng...

[CAU_HOI]
Loai: DIEN_TU
Muc_Do: Van_Dung
De_Bai: Nội dung câu hỏi điền từ (dùng ___ để đánh dấu chỗ trống)...
Dap_An: đáp án đúng cần điền
Loi_Giai: Giải thích tại đây...

=PHAN_2_TU_LUAN=
[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Van_Dung_Cao
De_Bai: Nội dung bài toán/câu hỏi tự luận cần trình bày các bước giải...
So_Dong_Nhap: 8
Loi_Giai: Hướng dẫn chấm và các bước giải chi tiết...`;

export const EXAM_PROMPT_EXAMPLE = `=PHAN_1_TRAC_NGHIEM=
[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: Kết quả của phép tính (-5) + 3 là bao nhiêu?
A. -2
B. 2
C. -8
D. 8
Dap_An: A
Loi_Giai: (-5) + 3 = -(5 - 3) = -2, vì |-5| > |3| nên kết quả mang dấu âm.

[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Thong_Hieu
De_Bai: Tích của hai số nguyên âm luôn là một số nguyên dương.
Dap_An: Dung
Loi_Giai: Theo quy tắc dấu: (-) x (-) = (+), nên tích của hai số nguyên âm luôn là số dương.

[CAU_HOI]
Loai: DIEN_TU
Muc_Do: Van_Dung
De_Bai: Điền số thích hợp vào chỗ trống: |-12| + |-8| = ___
Dap_An: 20
Loi_Giai: |-12| = 12, |-8| = 8, suy ra 12 + 8 = 20.

=PHAN_2_TU_LUAN=
[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Van_Dung_Cao
De_Bai: Một chiếc tàu ngầm đang ở độ sâu 45m so với mực nước biển. Tàu di chuyển lên 20m rồi tiếp tục lặn xuống 30m. Hỏi tàu ngầm đang ở độ sâu bao nhiêu mét so với mực nước biển? Trình bày lời giải bằng phép tính với số nguyên.
So_Dong_Nhap: 6
Loi_Giai: Độ sâu ban đầu: -45m. Sau khi lên 20m: -45 + 20 = -25m. Sau khi lặn xuống 30m: -25 - 30 = -55m. Vậy tàu ngầm đang ở độ sâu 55m so với mực nước biển.`;
