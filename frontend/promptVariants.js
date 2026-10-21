// TU DONG SINH tu AI_Prompts_Variants.txt bang tools/gen-prompt-variants.js -- DUNG SUA TAY.
// Nguon rieng (intro/tip/vi du) la AI_Prompts_Variants.txt o goc du an; quy tac dinh dang dung
// chung van lay tu Gemini_Prompt_Unified.txt. Sua o do roi chay: npm run gen:prompt
export const AI_PROMPT_VARIANTS = [
  {
    id: "gemini",
    label: "Gemini (thường)",
    hint: "Dán vào Gemini bản chat thường tại gemini.google.com hoặc app Gemini trên điện thoại (khác với tab \"Tự động\" trong ExamBuilder — tab đó gọi Gemini qua API ngay trong phần mềm).",
    exampleTopic: "Toán 6 - Số nguyên",
    template: `Bạn là chuyên gia khảo thí và biên soạn đề kiểm tra. Hãy soạn nội dung đề kiểm tra về chủ đề [NHẬP MÔN HỌC/CHỦ ĐỀ Ở ĐÂY].

Kết quả của bạn sẽ được một PHẦN MỀM ĐỌC TỰ ĐỘNG, không phải con người đọc. Vì vậy phải tuân thủ TUYỆT ĐỐI định dạng bên dưới. Chỉ cần sai một chi tiết là phần mềm sẽ báo lỗi hoặc hiểu sai nội dung.

━━━━━━━━━━━━━━ QUY TẮC XUẤT KẾT QUẢ (bắt buộc) ━━━━━━━━━━━━━━
1. CHỈ xuất ra nội dung đề theo đúng định dạng dưới đây. TUYỆT ĐỐI KHÔNG viết lời chào, lời dẫn ("Dưới đây là đề..."), ghi chú, lời kết. KHÔNG đặt kết quả trong khối mã / code block. KHÔNG dùng ký hiệu markdown (dấu sao, dấu thăng, gạch đầu dòng, bảng...).
2. Đề gồm ĐÚNG 2 phần. Mỗi phần mở đầu bằng một dòng header viết y hệt, chữ IN HOA không dấu, có dấu "=" ở hai đầu, NẰM MỘT MÌNH TRÊN DÒNG và có một dòng trống ngay phía trước:
      =PHAN_1_TRAC_NGHIEM=   → chứa mọi câu loại TN, DUNG_SAI, DIEN_TU
      =PHAN_2_TU_LUAN=       → chỉ chứa câu loại TU_LUAN
3. Mỗi câu hỏi bắt đầu bằng đúng dòng:  [CAU_HOI]  — nằm một mình trên dòng, có một dòng trống ngay phía trước. TUYỆT ĐỐI không nối "[CAU_HOI]" hay dòng header vào cuối dòng "Loi_Giai:" của câu trước.
4. Mỗi câu chỉ được có DUY NHẤT một dòng "Dap_An:" và DUY NHẤT một dòng "Loi_Giai:". Hãy suy nghĩ và tự kiểm tra thật kỹ TRƯỚC khi viết, rồi chỉ ghi ra đáp án CUỐI CÙNG mà bạn chắc chắn đúng. Không được ghi "Dap_An:" hoặc "Loi_Giai:" lần thứ hai để tự sửa lại trong cùng một câu.
5. Mỗi trường viết trên MỘT dòng, đúng dạng "Tên_Trường: giá trị". Tên trường viết y hệt (Loai, Muc_Do, De_Bai, Dap_An, Loi_Giai, So_Dong_Nhap) — không dịch, không đổi, không thêm khoảng trắng trong tên. Nội dung "De_Bai:" viết liền trên một dòng, KHÔNG xuống dòng giữa câu — ngoại lệ DUY NHẤT là các ý nhỏ a) b) c)… theo quy tắc 6 — và KHÔNG bắt đầu bất kỳ dòng nào bằng "A." … "D." hay bằng tên một trường.
6. CÂU CÓ NHIỀU Ý NHỎ (thường là TU_LUAN): dòng "De_Bai:" chỉ ghi phần dẫn chung (dữ kiện, biểu thức, hình vẽ được mô tả…). Sau đó MỖI Ý NHỎ VIẾT TRÊN MỘT DÒNG RIÊNG ngay bên dưới, theo thứ tự, mỗi dòng bắt đầu bằng chữ cái thường + dấu ngoặc đóng + một dấu cách: "a) ", "b) ", "c) ", "d) ", "e) ". TUYỆT ĐỐI KHÔNG dồn nhiều ý vào cùng một dòng (sai: "De_Bai: Cho A = … a) Tính … b) Tìm …"). KHÔNG đánh số ý bằng "1)", "1.", "a.", "A.", "Ý 1:" hay gạch đầu dòng; KHÔNG để dòng trống giữa các ý. Với TU_LUAN, các dòng ý nằm NGAY SAU dòng "De_Bai:" và TRƯỚC dòng "So_Dong_Nhap:". Lời giải cũng trình bày như vậy: dòng "Loi_Giai:" ghi phần chung (nếu có, hoặc ghi "Lời giải từng ý:"), rồi lời giải mỗi ý trên một dòng riêng bắt đầu bằng "a) ", "b) "… đúng thứ tự như đề. Nếu các ý khác mức độ, ghi Muc_Do theo ý khó nhất.

━━━━━━━━━━━━━━ TỪ VỰNG BẮT BUỘC ━━━━━━━━━━━━━━
Trường Loai — viết đúng MỘT trong 4 giá trị:  TN  |  DUNG_SAI  |  DIEN_TU  |  TU_LUAN
Trường Muc_Do — viết đúng MỘT trong 4 giá trị:  Nhan_Biet  |  Thong_Hieu  |  Van_Dung  |  Van_Dung_Cao

━━━━━━━━━━━━━━ ĐỊNH DẠNG CHI TIẾT TỪNG LOẠI CÂU ━━━━━━━━━━━━━━

• TN — trắc nghiệm 4 lựa chọn:
  [CAU_HOI]
  Loai: TN
  Muc_Do: <mức độ>
  De_Bai: <nội dung câu hỏi, một dòng>
  A. <nội dung lựa chọn A>
  B. <nội dung lựa chọn B>
  C. <nội dung lựa chọn C>
  D. <nội dung lựa chọn D>
  Dap_An: <MỘT chữ cái: A hoặc B hoặc C hoặc D — phải trùng đúng một lựa chọn ở trên>
  Loi_Giai: <giải thích vì sao đáp án đó đúng>
  → Bắt buộc đủ 4 lựa chọn, mỗi lựa chọn một dòng riêng, bắt đầu bằng "A. ", "B. ", "C. ", "D. ".

• DUNG_SAI — một nhận định, học sinh xét đúng/sai:
  [CAU_HOI]
  Loai: DUNG_SAI
  Muc_Do: <mức độ>
  De_Bai: <một mệnh đề/nhận định trọn vẹn>
  Dap_An: <đúng một từ:  Dung  hoặc  Sai  — không dấu, viết hoa chữ cái đầu>
  Loi_Giai: <giải thích>

• DIEN_TU — điền vào chỗ trống:
  [CAU_HOI]
  Loai: DIEN_TU
  Muc_Do: <mức độ>
  De_Bai: <câu có chỗ trống, đánh dấu chỗ trống bằng ba dấu gạch dưới:  ___ >
  Dap_An: <từ / cụm từ / số cần điền vào chỗ trống>
  Loi_Giai: <giải thích>

• TU_LUAN — tự luận (CHỈ đặt trong =PHAN_2_TU_LUAN=):
  [CAU_HOI]
  Loai: TU_LUAN
  Muc_Do: <mức độ>
  De_Bai: <đề bài yêu cầu học sinh trình bày lời giải>
  So_Dong_Nhap: <số nguyên dương — số dòng kẻ trống chừa cho học sinh làm bài, ví dụ 5 đến 12>
  Loi_Giai: <hướng dẫn chấm / đáp án / các bước giải chi tiết>

• TU_LUAN có nhiều ý nhỏ — mỗi ý MỘT DÒNG RIÊNG (quy tắc 6):
  [CAU_HOI]
  Loai: TU_LUAN
  Muc_Do: <mức độ của ý khó nhất>
  De_Bai: <phần dẫn chung của câu>
  a) <yêu cầu ý a>
  b) <yêu cầu ý b>
  c) <yêu cầu ý c>
  So_Dong_Nhap: <số dòng kẻ cho cả câu>
  Loi_Giai: Lời giải từng ý:
  a) <lời giải ý a>
  b) <lời giải ý b>
  c) <lời giải ý c>

━━━━━━━━━━━━━━ CÁCH VIẾT CÔNG THỨC TOÁN ━━━━━━━━━━━━━━
- BẮT BUỘC bọc trong $...$ và viết bằng LaTeX chuẩn cho MỌI công thức có cấu trúc 2 chiều (bên trên/bên dưới một gạch ngang):
    • Căn mọi loại: $\\sqrt{80}$ , $\\sqrt{b^2 - 4ac}$ , căn bậc n $\\sqrt[3]{x+1}$
    • Phân số mọi loại: $\\dfrac{2}{3}$ , $\\dfrac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$
    • Lũy thừa có cơ số hoặc số mũ là biểu thức: $x^{n+1}$ , $(a+b)^2$ , $(-2)^{3}$ , $2^{10}$
    • Tích phân / tổng / giới hạn có cận: $\\int_{0}^{1} x^2\\,dx$ , $\\sum_{k=1}^{n} k$ , $\\lim_{x \\to 0} f(x)$
    • Hệ phương trình, ma trận: $\\begin{cases} x + y = 1 \\\\ x - y = 3 \\end{cases}$
- CHỈ được gõ ASCII trần (KHÔNG có $...$) cho ký hiệu thật sự MỘT HÀNG: số mũ chỉ một chữ số như x^2 ; dấu nhân a*b ; so sánh <= >= != ; tương đương <=> ; suy ra => ; đơn vị cm2 cm3 ; số thập phân ; dấu cộng trừ viết +- .
- Không trộn nửa ASCII nửa LaTeX trong cùng một biểu thức. Một biểu thức: hoặc toàn ASCII, hoặc toàn LaTeX trong $...$.
- Nếu một biểu thức có căn hoặc phân số thì CẢ biểu thức đó phải nằm gọn trong MỘT cặp $...$ (kể cả phần số/biến đứng ngoài căn): viết $2\\sqrt{3} + 1$ chứ KHÔNG viết 2$\\sqrt{3}$+1 ; viết $\\dfrac{\\sqrt{80}}{5}$ chứ KHÔNG viết $\\sqrt{80}$/5 .

━━━━━━━━━━━━━━ SỐ LƯỢNG CÂU HỎI ━━━━━━━━━━━━━━
Nếu ở phần bổ sung phía dưới KHÔNG ghi yêu cầu số lượng cụ thể: hãy tạo khoảng 6 câu cho PHAN_1 (đủ cả TN, DUNG_SAI, DIEN_TU) và 2–3 câu TU_LUAN cho PHAN_2, phân bố trải đều 4 mức độ từ Nhan_Biet đến Van_Dung_Cao.
Nếu CÓ ghi yêu cầu số lượng: tuân thủ đúng số lượng và đúng loại × mức độ được yêu cầu.

━━━━━━━━━━━━━━ KHUNG MẪU — giữ nguyên cấu trúc, thay <...> bằng nội dung thật ━━━━━━━━━━━━━━

=PHAN_1_TRAC_NGHIEM=
[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: <nội dung câu trắc nghiệm>
A. <lựa chọn A>
B. <lựa chọn B>
C. <lựa chọn C>
D. <lựa chọn D>
Dap_An: A
Loi_Giai: <giải thích>

[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Thong_Hieu
De_Bai: <một nhận định>
Dap_An: Dung
Loi_Giai: <giải thích>

[CAU_HOI]
Loai: DIEN_TU
Muc_Do: Van_Dung
De_Bai: <câu hỏi có ___ ở chỗ trống>
Dap_An: <đáp án cần điền>
Loi_Giai: <giải thích>

=PHAN_2_TU_LUAN=
[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Van_Dung_Cao
De_Bai: <đề bài tự luận>
So_Dong_Nhap: 8
Loi_Giai: <hướng dẫn chấm và các bước giải chi tiết>

[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Van_Dung
De_Bai: <phần dẫn chung>
a) <yêu cầu ý a>
b) <yêu cầu ý b>
So_Dong_Nhap: 8
Loi_Giai: Lời giải từng ý:
a) <lời giải ý a>
b) <lời giải ý b>

LƯU Ý DÀNH RIÊNG CHO GEMINI: Nếu câu trả lời có nguy cơ bị dừng giữa chừng do giới hạn độ dài, hãy ưu tiên viết trọn vẹn từng câu hỏi (đủ cả "Dap_An:" và "Loi_Giai:") rồi mới dừng, không bỏ dở một câu đang viết. Nếu bạn tự chèn dấu ** hoặc gạch đầu dòng markdown, hãy xuất lại không dùng markdown. Gemini hay gộp các ý nhỏ của một câu thành một đoạn văn liền — KHÔNG làm vậy: với câu nhiều ý, BẮT BUỘC xuống dòng trước mỗi ý "a) ", "b) ", "c) "… cả trong đề bài lẫn lời giải (quy tắc 6).`,
    example: `=PHAN_1_TRAC_NGHIEM=
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
Loai: TN
Muc_Do: Thong_Hieu
De_Bai: Giá trị của biểu thức $(-2)^{3} + \\sqrt{16}$ bằng bao nhiêu?
A. -4
B. 4
C. -12
D. 12
Dap_An: A
Loi_Giai: $(-2)^{3} = -8$ và $\\sqrt{16} = 4$, nên -8 + 4 = -4.

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
Loi_Giai: Độ sâu ban đầu: -45m. Sau khi lên 20m: -45 + 20 = -25m. Sau khi lặn xuống 30m: -25 - 30 = -55m. Vậy tàu ngầm đang ở độ sâu 55m so với mực nước biển.`,
  },
  {
    id: "gemini_pro",
    label: "Gemini Pro",
    hint: "Dán vào Gemini Pro (gói Gemini Advanced / Google One AI Premium) tại gemini.google.com, chọn model 2.5 Pro (hoặc bản Pro mới nhất) — mạnh hơn bản Gemini thường ở khả năng suy luận và độ dài ngữ cảnh.",
    exampleTopic: "Sinh học 8 - Hệ tuần hoàn",
    template: `Bạn là chuyên gia khảo thí và biên soạn đề kiểm tra. Hãy soạn nội dung đề kiểm tra về chủ đề [NHẬP MÔN HỌC/CHỦ ĐỀ Ở ĐÂY].

Kết quả của bạn sẽ được một PHẦN MỀM ĐỌC TỰ ĐỘNG, không phải con người đọc. Vì vậy phải tuân thủ TUYỆT ĐỐI định dạng bên dưới. Chỉ cần sai một chi tiết là phần mềm sẽ báo lỗi hoặc hiểu sai nội dung.

━━━━━━━━━━━━━━ QUY TẮC XUẤT KẾT QUẢ (bắt buộc) ━━━━━━━━━━━━━━
1. CHỈ xuất ra nội dung đề theo đúng định dạng dưới đây. TUYỆT ĐỐI KHÔNG viết lời chào, lời dẫn ("Dưới đây là đề..."), ghi chú, lời kết. KHÔNG đặt kết quả trong khối mã / code block. KHÔNG dùng ký hiệu markdown (dấu sao, dấu thăng, gạch đầu dòng, bảng...).
2. Đề gồm ĐÚNG 2 phần. Mỗi phần mở đầu bằng một dòng header viết y hệt, chữ IN HOA không dấu, có dấu "=" ở hai đầu, NẰM MỘT MÌNH TRÊN DÒNG và có một dòng trống ngay phía trước:
      =PHAN_1_TRAC_NGHIEM=   → chứa mọi câu loại TN, DUNG_SAI, DIEN_TU
      =PHAN_2_TU_LUAN=       → chỉ chứa câu loại TU_LUAN
3. Mỗi câu hỏi bắt đầu bằng đúng dòng:  [CAU_HOI]  — nằm một mình trên dòng, có một dòng trống ngay phía trước. TUYỆT ĐỐI không nối "[CAU_HOI]" hay dòng header vào cuối dòng "Loi_Giai:" của câu trước.
4. Mỗi câu chỉ được có DUY NHẤT một dòng "Dap_An:" và DUY NHẤT một dòng "Loi_Giai:". Hãy suy nghĩ và tự kiểm tra thật kỹ TRƯỚC khi viết, rồi chỉ ghi ra đáp án CUỐI CÙNG mà bạn chắc chắn đúng. Không được ghi "Dap_An:" hoặc "Loi_Giai:" lần thứ hai để tự sửa lại trong cùng một câu.
5. Mỗi trường viết trên MỘT dòng, đúng dạng "Tên_Trường: giá trị". Tên trường viết y hệt (Loai, Muc_Do, De_Bai, Dap_An, Loi_Giai, So_Dong_Nhap) — không dịch, không đổi, không thêm khoảng trắng trong tên. Nội dung "De_Bai:" viết liền trên một dòng, KHÔNG xuống dòng giữa câu — ngoại lệ DUY NHẤT là các ý nhỏ a) b) c)… theo quy tắc 6 — và KHÔNG bắt đầu bất kỳ dòng nào bằng "A." … "D." hay bằng tên một trường.
6. CÂU CÓ NHIỀU Ý NHỎ (thường là TU_LUAN): dòng "De_Bai:" chỉ ghi phần dẫn chung (dữ kiện, biểu thức, hình vẽ được mô tả…). Sau đó MỖI Ý NHỎ VIẾT TRÊN MỘT DÒNG RIÊNG ngay bên dưới, theo thứ tự, mỗi dòng bắt đầu bằng chữ cái thường + dấu ngoặc đóng + một dấu cách: "a) ", "b) ", "c) ", "d) ", "e) ". TUYỆT ĐỐI KHÔNG dồn nhiều ý vào cùng một dòng (sai: "De_Bai: Cho A = … a) Tính … b) Tìm …"). KHÔNG đánh số ý bằng "1)", "1.", "a.", "A.", "Ý 1:" hay gạch đầu dòng; KHÔNG để dòng trống giữa các ý. Với TU_LUAN, các dòng ý nằm NGAY SAU dòng "De_Bai:" và TRƯỚC dòng "So_Dong_Nhap:". Lời giải cũng trình bày như vậy: dòng "Loi_Giai:" ghi phần chung (nếu có, hoặc ghi "Lời giải từng ý:"), rồi lời giải mỗi ý trên một dòng riêng bắt đầu bằng "a) ", "b) "… đúng thứ tự như đề. Nếu các ý khác mức độ, ghi Muc_Do theo ý khó nhất.

━━━━━━━━━━━━━━ TỪ VỰNG BẮT BUỘC ━━━━━━━━━━━━━━
Trường Loai — viết đúng MỘT trong 4 giá trị:  TN  |  DUNG_SAI  |  DIEN_TU  |  TU_LUAN
Trường Muc_Do — viết đúng MỘT trong 4 giá trị:  Nhan_Biet  |  Thong_Hieu  |  Van_Dung  |  Van_Dung_Cao

━━━━━━━━━━━━━━ ĐỊNH DẠNG CHI TIẾT TỪNG LOẠI CÂU ━━━━━━━━━━━━━━

• TN — trắc nghiệm 4 lựa chọn:
  [CAU_HOI]
  Loai: TN
  Muc_Do: <mức độ>
  De_Bai: <nội dung câu hỏi, một dòng>
  A. <nội dung lựa chọn A>
  B. <nội dung lựa chọn B>
  C. <nội dung lựa chọn C>
  D. <nội dung lựa chọn D>
  Dap_An: <MỘT chữ cái: A hoặc B hoặc C hoặc D — phải trùng đúng một lựa chọn ở trên>
  Loi_Giai: <giải thích vì sao đáp án đó đúng>
  → Bắt buộc đủ 4 lựa chọn, mỗi lựa chọn một dòng riêng, bắt đầu bằng "A. ", "B. ", "C. ", "D. ".

• DUNG_SAI — một nhận định, học sinh xét đúng/sai:
  [CAU_HOI]
  Loai: DUNG_SAI
  Muc_Do: <mức độ>
  De_Bai: <một mệnh đề/nhận định trọn vẹn>
  Dap_An: <đúng một từ:  Dung  hoặc  Sai  — không dấu, viết hoa chữ cái đầu>
  Loi_Giai: <giải thích>

• DIEN_TU — điền vào chỗ trống:
  [CAU_HOI]
  Loai: DIEN_TU
  Muc_Do: <mức độ>
  De_Bai: <câu có chỗ trống, đánh dấu chỗ trống bằng ba dấu gạch dưới:  ___ >
  Dap_An: <từ / cụm từ / số cần điền vào chỗ trống>
  Loi_Giai: <giải thích>

• TU_LUAN — tự luận (CHỈ đặt trong =PHAN_2_TU_LUAN=):
  [CAU_HOI]
  Loai: TU_LUAN
  Muc_Do: <mức độ>
  De_Bai: <đề bài yêu cầu học sinh trình bày lời giải>
  So_Dong_Nhap: <số nguyên dương — số dòng kẻ trống chừa cho học sinh làm bài, ví dụ 5 đến 12>
  Loi_Giai: <hướng dẫn chấm / đáp án / các bước giải chi tiết>

• TU_LUAN có nhiều ý nhỏ — mỗi ý MỘT DÒNG RIÊNG (quy tắc 6):
  [CAU_HOI]
  Loai: TU_LUAN
  Muc_Do: <mức độ của ý khó nhất>
  De_Bai: <phần dẫn chung của câu>
  a) <yêu cầu ý a>
  b) <yêu cầu ý b>
  c) <yêu cầu ý c>
  So_Dong_Nhap: <số dòng kẻ cho cả câu>
  Loi_Giai: Lời giải từng ý:
  a) <lời giải ý a>
  b) <lời giải ý b>
  c) <lời giải ý c>

━━━━━━━━━━━━━━ CÁCH VIẾT CÔNG THỨC TOÁN ━━━━━━━━━━━━━━
- BẮT BUỘC bọc trong $...$ và viết bằng LaTeX chuẩn cho MỌI công thức có cấu trúc 2 chiều (bên trên/bên dưới một gạch ngang):
    • Căn mọi loại: $\\sqrt{80}$ , $\\sqrt{b^2 - 4ac}$ , căn bậc n $\\sqrt[3]{x+1}$
    • Phân số mọi loại: $\\dfrac{2}{3}$ , $\\dfrac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$
    • Lũy thừa có cơ số hoặc số mũ là biểu thức: $x^{n+1}$ , $(a+b)^2$ , $(-2)^{3}$ , $2^{10}$
    • Tích phân / tổng / giới hạn có cận: $\\int_{0}^{1} x^2\\,dx$ , $\\sum_{k=1}^{n} k$ , $\\lim_{x \\to 0} f(x)$
    • Hệ phương trình, ma trận: $\\begin{cases} x + y = 1 \\\\ x - y = 3 \\end{cases}$
- CHỈ được gõ ASCII trần (KHÔNG có $...$) cho ký hiệu thật sự MỘT HÀNG: số mũ chỉ một chữ số như x^2 ; dấu nhân a*b ; so sánh <= >= != ; tương đương <=> ; suy ra => ; đơn vị cm2 cm3 ; số thập phân ; dấu cộng trừ viết +- .
- Không trộn nửa ASCII nửa LaTeX trong cùng một biểu thức. Một biểu thức: hoặc toàn ASCII, hoặc toàn LaTeX trong $...$.
- Nếu một biểu thức có căn hoặc phân số thì CẢ biểu thức đó phải nằm gọn trong MỘT cặp $...$ (kể cả phần số/biến đứng ngoài căn): viết $2\\sqrt{3} + 1$ chứ KHÔNG viết 2$\\sqrt{3}$+1 ; viết $\\dfrac{\\sqrt{80}}{5}$ chứ KHÔNG viết $\\sqrt{80}$/5 .

━━━━━━━━━━━━━━ SỐ LƯỢNG CÂU HỎI ━━━━━━━━━━━━━━
Nếu ở phần bổ sung phía dưới KHÔNG ghi yêu cầu số lượng cụ thể: hãy tạo khoảng 6 câu cho PHAN_1 (đủ cả TN, DUNG_SAI, DIEN_TU) và 2–3 câu TU_LUAN cho PHAN_2, phân bố trải đều 4 mức độ từ Nhan_Biet đến Van_Dung_Cao.
Nếu CÓ ghi yêu cầu số lượng: tuân thủ đúng số lượng và đúng loại × mức độ được yêu cầu.

━━━━━━━━━━━━━━ KHUNG MẪU — giữ nguyên cấu trúc, thay <...> bằng nội dung thật ━━━━━━━━━━━━━━

=PHAN_1_TRAC_NGHIEM=
[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: <nội dung câu trắc nghiệm>
A. <lựa chọn A>
B. <lựa chọn B>
C. <lựa chọn C>
D. <lựa chọn D>
Dap_An: A
Loi_Giai: <giải thích>

[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Thong_Hieu
De_Bai: <một nhận định>
Dap_An: Dung
Loi_Giai: <giải thích>

[CAU_HOI]
Loai: DIEN_TU
Muc_Do: Van_Dung
De_Bai: <câu hỏi có ___ ở chỗ trống>
Dap_An: <đáp án cần điền>
Loi_Giai: <giải thích>

=PHAN_2_TU_LUAN=
[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Van_Dung_Cao
De_Bai: <đề bài tự luận>
So_Dong_Nhap: 8
Loi_Giai: <hướng dẫn chấm và các bước giải chi tiết>

[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Van_Dung
De_Bai: <phần dẫn chung>
a) <yêu cầu ý a>
b) <yêu cầu ý b>
So_Dong_Nhap: 8
Loi_Giai: Lời giải từng ý:
a) <lời giải ý a>
b) <lời giải ý b>

LƯU Ý DÀNH RIÊNG CHO GEMINI PRO: Nhờ cửa sổ ngữ cảnh lớn, có thể dán kèm nguyên văn nội dung sách/bài giảng vào cuối prompt này làm tư liệu tham khảo ngay trong cùng một lượt hỏi. Nếu bạn bật chế độ suy luận sâu (Thinking/Deep Think), CHỈ xuất ra đáp án và lời giải cuối cùng theo đúng định dạng — không in ra các bước suy nghĩ trung gian, không có thẻ hay mục nào khác đứng trước dòng "=PHAN_1_TRAC_NGHIEM=". Gemini hay gộp các ý nhỏ của một câu thành một đoạn văn liền — KHÔNG làm vậy: với câu nhiều ý, BẮT BUỘC xuống dòng trước mỗi ý "a) ", "b) ", "c) "… cả trong đề bài lẫn lời giải (quy tắc 6).`,
    example: `=PHAN_1_TRAC_NGHIEM=
[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: Hệ tuần hoàn ở người có chức năng chính là gì?
A. Vận chuyển máu và các chất dinh dưỡng, khí đi khắp cơ thể
B. Tiêu hóa thức ăn thành chất dinh dưỡng
C. Lọc và bài tiết nước tiểu
D. Điều khiển mọi hoạt động của cơ thể
Dap_An: A
Loi_Giai: Hệ tuần hoàn gồm tim và mạch máu, có chức năng vận chuyển máu mang oxi, chất dinh dưỡng, hoocmon và các chất thải đi khắp cơ thể.

[CAU_HOI]
Loai: TN
Muc_Do: Thong_Hieu
De_Bai: Tim người có mấy ngăn?
A. 2 ngăn
B. 3 ngăn
C. 4 ngăn
D. 5 ngăn
Dap_An: C
Loi_Giai: Tim người có 4 ngăn: 2 tâm nhĩ (trái, phải) và 2 tâm thất (trái, phải).

[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Thong_Hieu
De_Bai: Máu chảy trong động mạch luôn là máu giàu oxi (máu đỏ tươi).
Dap_An: Sai
Loi_Giai: Không đúng với mọi trường hợp: động mạch chủ dẫn máu giàu oxi đi nuôi cơ thể, nhưng động mạch phổi lại dẫn máu nghèo oxi từ tim lên phổi để trao đổi khí.

[CAU_HOI]
Loai: DIEN_TU
Muc_Do: Van_Dung
De_Bai: Loại mạch máu có thành mỏng nhất, chỉ gồm một lớp tế bào, giúp máu trao đổi chất dễ dàng với tế bào cơ thể, được gọi là ___.
Dap_An: mao mạch
Loi_Giai: Mao mạch là mạch máu nhỏ nhất, thành chỉ gồm một lớp tế bào biểu mô, cho phép các chất trao đổi qua lại giữa máu và mô cơ thể.

=PHAN_2_TU_LUAN=
[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Van_Dung_Cao
De_Bai: Giải thích vì sao khi luyện tập thể dục thể thao thường xuyên, nhịp tim lúc nghỉ ngơi của một người có xu hướng giảm xuống theo thời gian.
So_Dong_Nhap: 8
Loi_Giai: Luyện tập thường xuyên làm cơ tim khỏe hơn, thành tim dày hơn nên mỗi lần co bóp tim tống được nhiều máu hơn (tăng thể tích tâm thu). Do đó để đáp ứng đủ nhu cầu oxi và dinh dưỡng cho cơ thể lúc nghỉ ngơi, tim không cần đập nhanh như trước, dẫn đến nhịp tim lúc nghỉ giảm xuống — đây là dấu hiệu của một trái tim khỏe mạnh.`,
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    hint: "Dán vào ChatGPT tại chatgpt.com hoặc app ChatGPT.",
    exampleTopic: "Vật lý 10 - Động học chất điểm",
    template: `Bạn là chuyên gia khảo thí và biên soạn đề kiểm tra. Hãy soạn nội dung đề kiểm tra về chủ đề [NHẬP MÔN HỌC/CHỦ ĐỀ Ở ĐÂY].

Kết quả của bạn sẽ được một PHẦN MỀM ĐỌC TỰ ĐỘNG, không phải con người đọc. Vì vậy phải tuân thủ TUYỆT ĐỐI định dạng bên dưới. Chỉ cần sai một chi tiết là phần mềm sẽ báo lỗi hoặc hiểu sai nội dung.

━━━━━━━━━━━━━━ QUY TẮC XUẤT KẾT QUẢ (bắt buộc) ━━━━━━━━━━━━━━
1. CHỈ xuất ra nội dung đề theo đúng định dạng dưới đây. TUYỆT ĐỐI KHÔNG viết lời chào, lời dẫn ("Dưới đây là đề..."), ghi chú, lời kết. KHÔNG đặt kết quả trong khối mã / code block. KHÔNG dùng ký hiệu markdown (dấu sao, dấu thăng, gạch đầu dòng, bảng...).
2. Đề gồm ĐÚNG 2 phần. Mỗi phần mở đầu bằng một dòng header viết y hệt, chữ IN HOA không dấu, có dấu "=" ở hai đầu, NẰM MỘT MÌNH TRÊN DÒNG và có một dòng trống ngay phía trước:
      =PHAN_1_TRAC_NGHIEM=   → chứa mọi câu loại TN, DUNG_SAI, DIEN_TU
      =PHAN_2_TU_LUAN=       → chỉ chứa câu loại TU_LUAN
3. Mỗi câu hỏi bắt đầu bằng đúng dòng:  [CAU_HOI]  — nằm một mình trên dòng, có một dòng trống ngay phía trước. TUYỆT ĐỐI không nối "[CAU_HOI]" hay dòng header vào cuối dòng "Loi_Giai:" của câu trước.
4. Mỗi câu chỉ được có DUY NHẤT một dòng "Dap_An:" và DUY NHẤT một dòng "Loi_Giai:". Hãy suy nghĩ và tự kiểm tra thật kỹ TRƯỚC khi viết, rồi chỉ ghi ra đáp án CUỐI CÙNG mà bạn chắc chắn đúng. Không được ghi "Dap_An:" hoặc "Loi_Giai:" lần thứ hai để tự sửa lại trong cùng một câu.
5. Mỗi trường viết trên MỘT dòng, đúng dạng "Tên_Trường: giá trị". Tên trường viết y hệt (Loai, Muc_Do, De_Bai, Dap_An, Loi_Giai, So_Dong_Nhap) — không dịch, không đổi, không thêm khoảng trắng trong tên. Nội dung "De_Bai:" viết liền trên một dòng, KHÔNG xuống dòng giữa câu — ngoại lệ DUY NHẤT là các ý nhỏ a) b) c)… theo quy tắc 6 — và KHÔNG bắt đầu bất kỳ dòng nào bằng "A." … "D." hay bằng tên một trường.
6. CÂU CÓ NHIỀU Ý NHỎ (thường là TU_LUAN): dòng "De_Bai:" chỉ ghi phần dẫn chung (dữ kiện, biểu thức, hình vẽ được mô tả…). Sau đó MỖI Ý NHỎ VIẾT TRÊN MỘT DÒNG RIÊNG ngay bên dưới, theo thứ tự, mỗi dòng bắt đầu bằng chữ cái thường + dấu ngoặc đóng + một dấu cách: "a) ", "b) ", "c) ", "d) ", "e) ". TUYỆT ĐỐI KHÔNG dồn nhiều ý vào cùng một dòng (sai: "De_Bai: Cho A = … a) Tính … b) Tìm …"). KHÔNG đánh số ý bằng "1)", "1.", "a.", "A.", "Ý 1:" hay gạch đầu dòng; KHÔNG để dòng trống giữa các ý. Với TU_LUAN, các dòng ý nằm NGAY SAU dòng "De_Bai:" và TRƯỚC dòng "So_Dong_Nhap:". Lời giải cũng trình bày như vậy: dòng "Loi_Giai:" ghi phần chung (nếu có, hoặc ghi "Lời giải từng ý:"), rồi lời giải mỗi ý trên một dòng riêng bắt đầu bằng "a) ", "b) "… đúng thứ tự như đề. Nếu các ý khác mức độ, ghi Muc_Do theo ý khó nhất.

━━━━━━━━━━━━━━ TỪ VỰNG BẮT BUỘC ━━━━━━━━━━━━━━
Trường Loai — viết đúng MỘT trong 4 giá trị:  TN  |  DUNG_SAI  |  DIEN_TU  |  TU_LUAN
Trường Muc_Do — viết đúng MỘT trong 4 giá trị:  Nhan_Biet  |  Thong_Hieu  |  Van_Dung  |  Van_Dung_Cao

━━━━━━━━━━━━━━ ĐỊNH DẠNG CHI TIẾT TỪNG LOẠI CÂU ━━━━━━━━━━━━━━

• TN — trắc nghiệm 4 lựa chọn:
  [CAU_HOI]
  Loai: TN
  Muc_Do: <mức độ>
  De_Bai: <nội dung câu hỏi, một dòng>
  A. <nội dung lựa chọn A>
  B. <nội dung lựa chọn B>
  C. <nội dung lựa chọn C>
  D. <nội dung lựa chọn D>
  Dap_An: <MỘT chữ cái: A hoặc B hoặc C hoặc D — phải trùng đúng một lựa chọn ở trên>
  Loi_Giai: <giải thích vì sao đáp án đó đúng>
  → Bắt buộc đủ 4 lựa chọn, mỗi lựa chọn một dòng riêng, bắt đầu bằng "A. ", "B. ", "C. ", "D. ".

• DUNG_SAI — một nhận định, học sinh xét đúng/sai:
  [CAU_HOI]
  Loai: DUNG_SAI
  Muc_Do: <mức độ>
  De_Bai: <một mệnh đề/nhận định trọn vẹn>
  Dap_An: <đúng một từ:  Dung  hoặc  Sai  — không dấu, viết hoa chữ cái đầu>
  Loi_Giai: <giải thích>

• DIEN_TU — điền vào chỗ trống:
  [CAU_HOI]
  Loai: DIEN_TU
  Muc_Do: <mức độ>
  De_Bai: <câu có chỗ trống, đánh dấu chỗ trống bằng ba dấu gạch dưới:  ___ >
  Dap_An: <từ / cụm từ / số cần điền vào chỗ trống>
  Loi_Giai: <giải thích>

• TU_LUAN — tự luận (CHỈ đặt trong =PHAN_2_TU_LUAN=):
  [CAU_HOI]
  Loai: TU_LUAN
  Muc_Do: <mức độ>
  De_Bai: <đề bài yêu cầu học sinh trình bày lời giải>
  So_Dong_Nhap: <số nguyên dương — số dòng kẻ trống chừa cho học sinh làm bài, ví dụ 5 đến 12>
  Loi_Giai: <hướng dẫn chấm / đáp án / các bước giải chi tiết>

• TU_LUAN có nhiều ý nhỏ — mỗi ý MỘT DÒNG RIÊNG (quy tắc 6):
  [CAU_HOI]
  Loai: TU_LUAN
  Muc_Do: <mức độ của ý khó nhất>
  De_Bai: <phần dẫn chung của câu>
  a) <yêu cầu ý a>
  b) <yêu cầu ý b>
  c) <yêu cầu ý c>
  So_Dong_Nhap: <số dòng kẻ cho cả câu>
  Loi_Giai: Lời giải từng ý:
  a) <lời giải ý a>
  b) <lời giải ý b>
  c) <lời giải ý c>

━━━━━━━━━━━━━━ CÁCH VIẾT CÔNG THỨC TOÁN ━━━━━━━━━━━━━━
- BẮT BUỘC bọc trong $...$ và viết bằng LaTeX chuẩn cho MỌI công thức có cấu trúc 2 chiều (bên trên/bên dưới một gạch ngang):
    • Căn mọi loại: $\\sqrt{80}$ , $\\sqrt{b^2 - 4ac}$ , căn bậc n $\\sqrt[3]{x+1}$
    • Phân số mọi loại: $\\dfrac{2}{3}$ , $\\dfrac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$
    • Lũy thừa có cơ số hoặc số mũ là biểu thức: $x^{n+1}$ , $(a+b)^2$ , $(-2)^{3}$ , $2^{10}$
    • Tích phân / tổng / giới hạn có cận: $\\int_{0}^{1} x^2\\,dx$ , $\\sum_{k=1}^{n} k$ , $\\lim_{x \\to 0} f(x)$
    • Hệ phương trình, ma trận: $\\begin{cases} x + y = 1 \\\\ x - y = 3 \\end{cases}$
- CHỈ được gõ ASCII trần (KHÔNG có $...$) cho ký hiệu thật sự MỘT HÀNG: số mũ chỉ một chữ số như x^2 ; dấu nhân a*b ; so sánh <= >= != ; tương đương <=> ; suy ra => ; đơn vị cm2 cm3 ; số thập phân ; dấu cộng trừ viết +- .
- Không trộn nửa ASCII nửa LaTeX trong cùng một biểu thức. Một biểu thức: hoặc toàn ASCII, hoặc toàn LaTeX trong $...$.
- Nếu một biểu thức có căn hoặc phân số thì CẢ biểu thức đó phải nằm gọn trong MỘT cặp $...$ (kể cả phần số/biến đứng ngoài căn): viết $2\\sqrt{3} + 1$ chứ KHÔNG viết 2$\\sqrt{3}$+1 ; viết $\\dfrac{\\sqrt{80}}{5}$ chứ KHÔNG viết $\\sqrt{80}$/5 .

━━━━━━━━━━━━━━ SỐ LƯỢNG CÂU HỎI ━━━━━━━━━━━━━━
Nếu ở phần bổ sung phía dưới KHÔNG ghi yêu cầu số lượng cụ thể: hãy tạo khoảng 6 câu cho PHAN_1 (đủ cả TN, DUNG_SAI, DIEN_TU) và 2–3 câu TU_LUAN cho PHAN_2, phân bố trải đều 4 mức độ từ Nhan_Biet đến Van_Dung_Cao.
Nếu CÓ ghi yêu cầu số lượng: tuân thủ đúng số lượng và đúng loại × mức độ được yêu cầu.

━━━━━━━━━━━━━━ KHUNG MẪU — giữ nguyên cấu trúc, thay <...> bằng nội dung thật ━━━━━━━━━━━━━━

=PHAN_1_TRAC_NGHIEM=
[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: <nội dung câu trắc nghiệm>
A. <lựa chọn A>
B. <lựa chọn B>
C. <lựa chọn C>
D. <lựa chọn D>
Dap_An: A
Loi_Giai: <giải thích>

[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Thong_Hieu
De_Bai: <một nhận định>
Dap_An: Dung
Loi_Giai: <giải thích>

[CAU_HOI]
Loai: DIEN_TU
Muc_Do: Van_Dung
De_Bai: <câu hỏi có ___ ở chỗ trống>
Dap_An: <đáp án cần điền>
Loi_Giai: <giải thích>

=PHAN_2_TU_LUAN=
[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Van_Dung_Cao
De_Bai: <đề bài tự luận>
So_Dong_Nhap: 8
Loi_Giai: <hướng dẫn chấm và các bước giải chi tiết>

[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Van_Dung
De_Bai: <phần dẫn chung>
a) <yêu cầu ý a>
b) <yêu cầu ý b>
So_Dong_Nhap: 8
Loi_Giai: Lời giải từng ý:
a) <lời giải ý a>
b) <lời giải ý b>

LƯU Ý DÀNH RIÊNG CHO CHATGPT: TUYỆT ĐỐI không bọc kết quả trong khối mã (ba dấu backtick), kể cả khi bạn có thói quen mặc định làm vậy với nội dung dạng danh sách/bảng. Không thêm câu mở đầu kiểu "Dưới đây là đề kiểm tra..." hay câu kết kiểu "Chúc bạn dạy tốt!" — chỉ xuất đúng nội dung đề theo định dạng đã nêu.`,
    example: `=PHAN_1_TRAC_NGHIEM=
[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: Một vật chuyển động thẳng đều đi được quãng đường 120m trong 20s. Tốc độ trung bình của vật là bao nhiêu?
A. 4 m/s
B. 6 m/s
C. 8 m/s
D. 10 m/s
Dap_An: B
Loi_Giai: Tốc độ trung bình $v = \\dfrac{s}{t} = \\dfrac{120}{20} = 6$ m/s.

[CAU_HOI]
Loai: TN
Muc_Do: Thong_Hieu
De_Bai: Một ô tô chuyển động thẳng nhanh dần đều từ trạng thái nghỉ với gia tốc 2 m/s². Sau 5s vận tốc của ô tô là bao nhiêu?
A. 5 m/s
B. 8 m/s
C. 10 m/s
D. 15 m/s
Dap_An: C
Loi_Giai: Áp dụng công thức $v = v_0 + at$, với $v_0 = 0$, $a = 2$ m/s², $t = 5$s, ta có $v = 0 + 2 \\times 5 = 10$ m/s.

[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Thong_Hieu
De_Bai: Trong chuyển động thẳng đều, quãng đường đi được luôn tỉ lệ thuận với thời gian chuyển động.
Dap_An: Dung
Loi_Giai: Vì $s = v \\times t$ với $v$ không đổi, nên $s$ tỉ lệ thuận với $t$.

[CAU_HOI]
Loai: DIEN_TU
Muc_Do: Van_Dung
De_Bai: Một vật rơi tự do từ độ cao 80m (bỏ qua sức cản không khí, lấy $g = 10$ m/s²). Thời gian vật chạm đất là ___ giây.
Dap_An: 4
Loi_Giai: Từ công thức $h = \\dfrac{1}{2}gt^2$, suy ra $t = \\sqrt{\\dfrac{2h}{g}} = \\sqrt{\\dfrac{2 \\times 80}{10}} = \\sqrt{16} = 4$ giây.

=PHAN_2_TU_LUAN=
[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Van_Dung_Cao
De_Bai: Hai xe máy xuất phát cùng lúc từ hai địa điểm A và B cách nhau 90km, chuyển động thẳng đều ngược chiều nhau để gặp nhau. Xe từ A có tốc độ 30 km/h, xe từ B có tốc độ 20 km/h. Hỏi sau bao lâu hai xe gặp nhau và vị trí gặp nhau cách A bao nhiêu km? Trình bày lời giải.
So_Dong_Nhap: 8
Loi_Giai: Tốc độ tiến lại gần nhau: $30 + 20 = 50$ km/h. Thời gian gặp nhau: $t = \\dfrac{90}{50} = 1{,}8$ giờ. Vị trí gặp nhau cách A: $30 \\times 1{,}8 = 54$ km.`,
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    hint: "Dán vào DeepSeek tại chat.deepseek.com hoặc app DeepSeek.",
    exampleTopic: "Hóa học 8 - Nguyên tử, phân tử",
    template: `Bạn là chuyên gia khảo thí và biên soạn đề kiểm tra. Hãy soạn nội dung đề kiểm tra về chủ đề [NHẬP MÔN HỌC/CHỦ ĐỀ Ở ĐÂY].

Kết quả của bạn sẽ được một PHẦN MỀM ĐỌC TỰ ĐỘNG, không phải con người đọc. Vì vậy phải tuân thủ TUYỆT ĐỐI định dạng bên dưới. Chỉ cần sai một chi tiết là phần mềm sẽ báo lỗi hoặc hiểu sai nội dung.

━━━━━━━━━━━━━━ QUY TẮC XUẤT KẾT QUẢ (bắt buộc) ━━━━━━━━━━━━━━
1. CHỈ xuất ra nội dung đề theo đúng định dạng dưới đây. TUYỆT ĐỐI KHÔNG viết lời chào, lời dẫn ("Dưới đây là đề..."), ghi chú, lời kết. KHÔNG đặt kết quả trong khối mã / code block. KHÔNG dùng ký hiệu markdown (dấu sao, dấu thăng, gạch đầu dòng, bảng...).
2. Đề gồm ĐÚNG 2 phần. Mỗi phần mở đầu bằng một dòng header viết y hệt, chữ IN HOA không dấu, có dấu "=" ở hai đầu, NẰM MỘT MÌNH TRÊN DÒNG và có một dòng trống ngay phía trước:
      =PHAN_1_TRAC_NGHIEM=   → chứa mọi câu loại TN, DUNG_SAI, DIEN_TU
      =PHAN_2_TU_LUAN=       → chỉ chứa câu loại TU_LUAN
3. Mỗi câu hỏi bắt đầu bằng đúng dòng:  [CAU_HOI]  — nằm một mình trên dòng, có một dòng trống ngay phía trước. TUYỆT ĐỐI không nối "[CAU_HOI]" hay dòng header vào cuối dòng "Loi_Giai:" của câu trước.
4. Mỗi câu chỉ được có DUY NHẤT một dòng "Dap_An:" và DUY NHẤT một dòng "Loi_Giai:". Hãy suy nghĩ và tự kiểm tra thật kỹ TRƯỚC khi viết, rồi chỉ ghi ra đáp án CUỐI CÙNG mà bạn chắc chắn đúng. Không được ghi "Dap_An:" hoặc "Loi_Giai:" lần thứ hai để tự sửa lại trong cùng một câu.
5. Mỗi trường viết trên MỘT dòng, đúng dạng "Tên_Trường: giá trị". Tên trường viết y hệt (Loai, Muc_Do, De_Bai, Dap_An, Loi_Giai, So_Dong_Nhap) — không dịch, không đổi, không thêm khoảng trắng trong tên. Nội dung "De_Bai:" viết liền trên một dòng, KHÔNG xuống dòng giữa câu — ngoại lệ DUY NHẤT là các ý nhỏ a) b) c)… theo quy tắc 6 — và KHÔNG bắt đầu bất kỳ dòng nào bằng "A." … "D." hay bằng tên một trường.
6. CÂU CÓ NHIỀU Ý NHỎ (thường là TU_LUAN): dòng "De_Bai:" chỉ ghi phần dẫn chung (dữ kiện, biểu thức, hình vẽ được mô tả…). Sau đó MỖI Ý NHỎ VIẾT TRÊN MỘT DÒNG RIÊNG ngay bên dưới, theo thứ tự, mỗi dòng bắt đầu bằng chữ cái thường + dấu ngoặc đóng + một dấu cách: "a) ", "b) ", "c) ", "d) ", "e) ". TUYỆT ĐỐI KHÔNG dồn nhiều ý vào cùng một dòng (sai: "De_Bai: Cho A = … a) Tính … b) Tìm …"). KHÔNG đánh số ý bằng "1)", "1.", "a.", "A.", "Ý 1:" hay gạch đầu dòng; KHÔNG để dòng trống giữa các ý. Với TU_LUAN, các dòng ý nằm NGAY SAU dòng "De_Bai:" và TRƯỚC dòng "So_Dong_Nhap:". Lời giải cũng trình bày như vậy: dòng "Loi_Giai:" ghi phần chung (nếu có, hoặc ghi "Lời giải từng ý:"), rồi lời giải mỗi ý trên một dòng riêng bắt đầu bằng "a) ", "b) "… đúng thứ tự như đề. Nếu các ý khác mức độ, ghi Muc_Do theo ý khó nhất.

━━━━━━━━━━━━━━ TỪ VỰNG BẮT BUỘC ━━━━━━━━━━━━━━
Trường Loai — viết đúng MỘT trong 4 giá trị:  TN  |  DUNG_SAI  |  DIEN_TU  |  TU_LUAN
Trường Muc_Do — viết đúng MỘT trong 4 giá trị:  Nhan_Biet  |  Thong_Hieu  |  Van_Dung  |  Van_Dung_Cao

━━━━━━━━━━━━━━ ĐỊNH DẠNG CHI TIẾT TỪNG LOẠI CÂU ━━━━━━━━━━━━━━

• TN — trắc nghiệm 4 lựa chọn:
  [CAU_HOI]
  Loai: TN
  Muc_Do: <mức độ>
  De_Bai: <nội dung câu hỏi, một dòng>
  A. <nội dung lựa chọn A>
  B. <nội dung lựa chọn B>
  C. <nội dung lựa chọn C>
  D. <nội dung lựa chọn D>
  Dap_An: <MỘT chữ cái: A hoặc B hoặc C hoặc D — phải trùng đúng một lựa chọn ở trên>
  Loi_Giai: <giải thích vì sao đáp án đó đúng>
  → Bắt buộc đủ 4 lựa chọn, mỗi lựa chọn một dòng riêng, bắt đầu bằng "A. ", "B. ", "C. ", "D. ".

• DUNG_SAI — một nhận định, học sinh xét đúng/sai:
  [CAU_HOI]
  Loai: DUNG_SAI
  Muc_Do: <mức độ>
  De_Bai: <một mệnh đề/nhận định trọn vẹn>
  Dap_An: <đúng một từ:  Dung  hoặc  Sai  — không dấu, viết hoa chữ cái đầu>
  Loi_Giai: <giải thích>

• DIEN_TU — điền vào chỗ trống:
  [CAU_HOI]
  Loai: DIEN_TU
  Muc_Do: <mức độ>
  De_Bai: <câu có chỗ trống, đánh dấu chỗ trống bằng ba dấu gạch dưới:  ___ >
  Dap_An: <từ / cụm từ / số cần điền vào chỗ trống>
  Loi_Giai: <giải thích>

• TU_LUAN — tự luận (CHỈ đặt trong =PHAN_2_TU_LUAN=):
  [CAU_HOI]
  Loai: TU_LUAN
  Muc_Do: <mức độ>
  De_Bai: <đề bài yêu cầu học sinh trình bày lời giải>
  So_Dong_Nhap: <số nguyên dương — số dòng kẻ trống chừa cho học sinh làm bài, ví dụ 5 đến 12>
  Loi_Giai: <hướng dẫn chấm / đáp án / các bước giải chi tiết>

• TU_LUAN có nhiều ý nhỏ — mỗi ý MỘT DÒNG RIÊNG (quy tắc 6):
  [CAU_HOI]
  Loai: TU_LUAN
  Muc_Do: <mức độ của ý khó nhất>
  De_Bai: <phần dẫn chung của câu>
  a) <yêu cầu ý a>
  b) <yêu cầu ý b>
  c) <yêu cầu ý c>
  So_Dong_Nhap: <số dòng kẻ cho cả câu>
  Loi_Giai: Lời giải từng ý:
  a) <lời giải ý a>
  b) <lời giải ý b>
  c) <lời giải ý c>

━━━━━━━━━━━━━━ CÁCH VIẾT CÔNG THỨC TOÁN ━━━━━━━━━━━━━━
- BẮT BUỘC bọc trong $...$ và viết bằng LaTeX chuẩn cho MỌI công thức có cấu trúc 2 chiều (bên trên/bên dưới một gạch ngang):
    • Căn mọi loại: $\\sqrt{80}$ , $\\sqrt{b^2 - 4ac}$ , căn bậc n $\\sqrt[3]{x+1}$
    • Phân số mọi loại: $\\dfrac{2}{3}$ , $\\dfrac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$
    • Lũy thừa có cơ số hoặc số mũ là biểu thức: $x^{n+1}$ , $(a+b)^2$ , $(-2)^{3}$ , $2^{10}$
    • Tích phân / tổng / giới hạn có cận: $\\int_{0}^{1} x^2\\,dx$ , $\\sum_{k=1}^{n} k$ , $\\lim_{x \\to 0} f(x)$
    • Hệ phương trình, ma trận: $\\begin{cases} x + y = 1 \\\\ x - y = 3 \\end{cases}$
- CHỈ được gõ ASCII trần (KHÔNG có $...$) cho ký hiệu thật sự MỘT HÀNG: số mũ chỉ một chữ số như x^2 ; dấu nhân a*b ; so sánh <= >= != ; tương đương <=> ; suy ra => ; đơn vị cm2 cm3 ; số thập phân ; dấu cộng trừ viết +- .
- Không trộn nửa ASCII nửa LaTeX trong cùng một biểu thức. Một biểu thức: hoặc toàn ASCII, hoặc toàn LaTeX trong $...$.
- Nếu một biểu thức có căn hoặc phân số thì CẢ biểu thức đó phải nằm gọn trong MỘT cặp $...$ (kể cả phần số/biến đứng ngoài căn): viết $2\\sqrt{3} + 1$ chứ KHÔNG viết 2$\\sqrt{3}$+1 ; viết $\\dfrac{\\sqrt{80}}{5}$ chứ KHÔNG viết $\\sqrt{80}$/5 .

━━━━━━━━━━━━━━ SỐ LƯỢNG CÂU HỎI ━━━━━━━━━━━━━━
Nếu ở phần bổ sung phía dưới KHÔNG ghi yêu cầu số lượng cụ thể: hãy tạo khoảng 6 câu cho PHAN_1 (đủ cả TN, DUNG_SAI, DIEN_TU) và 2–3 câu TU_LUAN cho PHAN_2, phân bố trải đều 4 mức độ từ Nhan_Biet đến Van_Dung_Cao.
Nếu CÓ ghi yêu cầu số lượng: tuân thủ đúng số lượng và đúng loại × mức độ được yêu cầu.

━━━━━━━━━━━━━━ KHUNG MẪU — giữ nguyên cấu trúc, thay <...> bằng nội dung thật ━━━━━━━━━━━━━━

=PHAN_1_TRAC_NGHIEM=
[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: <nội dung câu trắc nghiệm>
A. <lựa chọn A>
B. <lựa chọn B>
C. <lựa chọn C>
D. <lựa chọn D>
Dap_An: A
Loi_Giai: <giải thích>

[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Thong_Hieu
De_Bai: <một nhận định>
Dap_An: Dung
Loi_Giai: <giải thích>

[CAU_HOI]
Loai: DIEN_TU
Muc_Do: Van_Dung
De_Bai: <câu hỏi có ___ ở chỗ trống>
Dap_An: <đáp án cần điền>
Loi_Giai: <giải thích>

=PHAN_2_TU_LUAN=
[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Van_Dung_Cao
De_Bai: <đề bài tự luận>
So_Dong_Nhap: 8
Loi_Giai: <hướng dẫn chấm và các bước giải chi tiết>

[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Van_Dung
De_Bai: <phần dẫn chung>
a) <yêu cầu ý a>
b) <yêu cầu ý b>
So_Dong_Nhap: 8
Loi_Giai: Lời giải từng ý:
a) <lời giải ý a>
b) <lời giải ý b>

LƯU Ý DÀNH RIÊNG CHO DEEPSEEK: Nếu bạn có bước suy luận trước khi trả lời (thinking/reasoning, ví dụ chế độ DeepThink/R1), phần suy luận đó KHÔNG được lẫn vào nội dung xuất ra cho người dùng — nội dung bạn xuất ra phải bắt đầu ngay bằng dòng "=PHAN_1_TRAC_NGHIEM=", tuyệt đối không có thẻ <think>, không có dòng ghi chú hay tóm tắt suy luận nào khác đứng trước hoặc xen giữa.`,
    example: `=PHAN_1_TRAC_NGHIEM=
[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: Phân tử nước có công thức hóa học là gì?
A. H2O
B. CO2
C. O2
D. NaCl
Dap_An: A
Loi_Giai: Phân tử nước gồm 2 nguyên tử Hiđro và 1 nguyên tử Oxi liên kết với nhau, công thức hóa học là H2O.

[CAU_HOI]
Loai: TN
Muc_Do: Thong_Hieu
De_Bai: Phân tử khối của khí cacbonic (CO2) bằng bao nhiêu, biết nguyên tử khối của C là 12, của O là 16?
A. 28
B. 32
C. 44
D. 60
Dap_An: C
Loi_Giai: Phân tử khối CO2 = 12 + 16 x 2 = 12 + 32 = 44 đvC.

[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Thong_Hieu
De_Bai: Nguyên tử trung hòa về điện vì số proton trong hạt nhân luôn bằng số electron ở lớp vỏ.
Dap_An: Dung
Loi_Giai: Proton mang điện tích dương, electron mang điện tích âm với độ lớn bằng nhau; số proton bằng số electron nên nguyên tử trung hòa về điện.

[CAU_HOI]
Loai: DIEN_TU
Muc_Do: Van_Dung
De_Bai: Một phân tử khí oxi gồm 2 nguyên tử O. Biết nguyên tử khối của O là 16, phân tử khối của khí oxi là ___ đvC.
Dap_An: 32
Loi_Giai: Phân tử khối O2 = 16 x 2 = 32 đvC.

=PHAN_2_TU_LUAN=
[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Van_Dung_Cao
De_Bai: Hợp chất X có phân tử gồm 1 nguyên tử nguyên tố R liên kết với 2 nguyên tử Oxi, phân tử khối của X là 44 đvC. Xác định nguyên tố R và viết công thức hóa học của X. Biết nguyên tử khối của O là 16.
So_Dong_Nhap: 6
Loi_Giai: Gọi nguyên tử khối của R là x. Ta có: x + 16 x 2 = 44, suy ra x = 44 - 32 = 12. Vậy R là Cacbon (C), công thức hóa học của X là CO2.`,
  },
  {
    id: "claude",
    label: "Claude",
    hint: "Dán vào Claude tại claude.ai hoặc app Claude.",
    exampleTopic: "Lịch sử 9 - Cách mạng tháng Tám 1945",
    template: `Bạn là chuyên gia khảo thí và biên soạn đề kiểm tra. Hãy soạn nội dung đề kiểm tra về chủ đề [NHẬP MÔN HỌC/CHỦ ĐỀ Ở ĐÂY].

Kết quả của bạn sẽ được một PHẦN MỀM ĐỌC TỰ ĐỘNG, không phải con người đọc. Vì vậy phải tuân thủ TUYỆT ĐỐI định dạng bên dưới. Chỉ cần sai một chi tiết là phần mềm sẽ báo lỗi hoặc hiểu sai nội dung.

━━━━━━━━━━━━━━ QUY TẮC XUẤT KẾT QUẢ (bắt buộc) ━━━━━━━━━━━━━━
1. CHỈ xuất ra nội dung đề theo đúng định dạng dưới đây. TUYỆT ĐỐI KHÔNG viết lời chào, lời dẫn ("Dưới đây là đề..."), ghi chú, lời kết. KHÔNG đặt kết quả trong khối mã / code block. KHÔNG dùng ký hiệu markdown (dấu sao, dấu thăng, gạch đầu dòng, bảng...).
2. Đề gồm ĐÚNG 2 phần. Mỗi phần mở đầu bằng một dòng header viết y hệt, chữ IN HOA không dấu, có dấu "=" ở hai đầu, NẰM MỘT MÌNH TRÊN DÒNG và có một dòng trống ngay phía trước:
      =PHAN_1_TRAC_NGHIEM=   → chứa mọi câu loại TN, DUNG_SAI, DIEN_TU
      =PHAN_2_TU_LUAN=       → chỉ chứa câu loại TU_LUAN
3. Mỗi câu hỏi bắt đầu bằng đúng dòng:  [CAU_HOI]  — nằm một mình trên dòng, có một dòng trống ngay phía trước. TUYỆT ĐỐI không nối "[CAU_HOI]" hay dòng header vào cuối dòng "Loi_Giai:" của câu trước.
4. Mỗi câu chỉ được có DUY NHẤT một dòng "Dap_An:" và DUY NHẤT một dòng "Loi_Giai:". Hãy suy nghĩ và tự kiểm tra thật kỹ TRƯỚC khi viết, rồi chỉ ghi ra đáp án CUỐI CÙNG mà bạn chắc chắn đúng. Không được ghi "Dap_An:" hoặc "Loi_Giai:" lần thứ hai để tự sửa lại trong cùng một câu.
5. Mỗi trường viết trên MỘT dòng, đúng dạng "Tên_Trường: giá trị". Tên trường viết y hệt (Loai, Muc_Do, De_Bai, Dap_An, Loi_Giai, So_Dong_Nhap) — không dịch, không đổi, không thêm khoảng trắng trong tên. Nội dung "De_Bai:" viết liền trên một dòng, KHÔNG xuống dòng giữa câu — ngoại lệ DUY NHẤT là các ý nhỏ a) b) c)… theo quy tắc 6 — và KHÔNG bắt đầu bất kỳ dòng nào bằng "A." … "D." hay bằng tên một trường.
6. CÂU CÓ NHIỀU Ý NHỎ (thường là TU_LUAN): dòng "De_Bai:" chỉ ghi phần dẫn chung (dữ kiện, biểu thức, hình vẽ được mô tả…). Sau đó MỖI Ý NHỎ VIẾT TRÊN MỘT DÒNG RIÊNG ngay bên dưới, theo thứ tự, mỗi dòng bắt đầu bằng chữ cái thường + dấu ngoặc đóng + một dấu cách: "a) ", "b) ", "c) ", "d) ", "e) ". TUYỆT ĐỐI KHÔNG dồn nhiều ý vào cùng một dòng (sai: "De_Bai: Cho A = … a) Tính … b) Tìm …"). KHÔNG đánh số ý bằng "1)", "1.", "a.", "A.", "Ý 1:" hay gạch đầu dòng; KHÔNG để dòng trống giữa các ý. Với TU_LUAN, các dòng ý nằm NGAY SAU dòng "De_Bai:" và TRƯỚC dòng "So_Dong_Nhap:". Lời giải cũng trình bày như vậy: dòng "Loi_Giai:" ghi phần chung (nếu có, hoặc ghi "Lời giải từng ý:"), rồi lời giải mỗi ý trên một dòng riêng bắt đầu bằng "a) ", "b) "… đúng thứ tự như đề. Nếu các ý khác mức độ, ghi Muc_Do theo ý khó nhất.

━━━━━━━━━━━━━━ TỪ VỰNG BẮT BUỘC ━━━━━━━━━━━━━━
Trường Loai — viết đúng MỘT trong 4 giá trị:  TN  |  DUNG_SAI  |  DIEN_TU  |  TU_LUAN
Trường Muc_Do — viết đúng MỘT trong 4 giá trị:  Nhan_Biet  |  Thong_Hieu  |  Van_Dung  |  Van_Dung_Cao

━━━━━━━━━━━━━━ ĐỊNH DẠNG CHI TIẾT TỪNG LOẠI CÂU ━━━━━━━━━━━━━━

• TN — trắc nghiệm 4 lựa chọn:
  [CAU_HOI]
  Loai: TN
  Muc_Do: <mức độ>
  De_Bai: <nội dung câu hỏi, một dòng>
  A. <nội dung lựa chọn A>
  B. <nội dung lựa chọn B>
  C. <nội dung lựa chọn C>
  D. <nội dung lựa chọn D>
  Dap_An: <MỘT chữ cái: A hoặc B hoặc C hoặc D — phải trùng đúng một lựa chọn ở trên>
  Loi_Giai: <giải thích vì sao đáp án đó đúng>
  → Bắt buộc đủ 4 lựa chọn, mỗi lựa chọn một dòng riêng, bắt đầu bằng "A. ", "B. ", "C. ", "D. ".

• DUNG_SAI — một nhận định, học sinh xét đúng/sai:
  [CAU_HOI]
  Loai: DUNG_SAI
  Muc_Do: <mức độ>
  De_Bai: <một mệnh đề/nhận định trọn vẹn>
  Dap_An: <đúng một từ:  Dung  hoặc  Sai  — không dấu, viết hoa chữ cái đầu>
  Loi_Giai: <giải thích>

• DIEN_TU — điền vào chỗ trống:
  [CAU_HOI]
  Loai: DIEN_TU
  Muc_Do: <mức độ>
  De_Bai: <câu có chỗ trống, đánh dấu chỗ trống bằng ba dấu gạch dưới:  ___ >
  Dap_An: <từ / cụm từ / số cần điền vào chỗ trống>
  Loi_Giai: <giải thích>

• TU_LUAN — tự luận (CHỈ đặt trong =PHAN_2_TU_LUAN=):
  [CAU_HOI]
  Loai: TU_LUAN
  Muc_Do: <mức độ>
  De_Bai: <đề bài yêu cầu học sinh trình bày lời giải>
  So_Dong_Nhap: <số nguyên dương — số dòng kẻ trống chừa cho học sinh làm bài, ví dụ 5 đến 12>
  Loi_Giai: <hướng dẫn chấm / đáp án / các bước giải chi tiết>

• TU_LUAN có nhiều ý nhỏ — mỗi ý MỘT DÒNG RIÊNG (quy tắc 6):
  [CAU_HOI]
  Loai: TU_LUAN
  Muc_Do: <mức độ của ý khó nhất>
  De_Bai: <phần dẫn chung của câu>
  a) <yêu cầu ý a>
  b) <yêu cầu ý b>
  c) <yêu cầu ý c>
  So_Dong_Nhap: <số dòng kẻ cho cả câu>
  Loi_Giai: Lời giải từng ý:
  a) <lời giải ý a>
  b) <lời giải ý b>
  c) <lời giải ý c>

━━━━━━━━━━━━━━ CÁCH VIẾT CÔNG THỨC TOÁN ━━━━━━━━━━━━━━
- BẮT BUỘC bọc trong $...$ và viết bằng LaTeX chuẩn cho MỌI công thức có cấu trúc 2 chiều (bên trên/bên dưới một gạch ngang):
    • Căn mọi loại: $\\sqrt{80}$ , $\\sqrt{b^2 - 4ac}$ , căn bậc n $\\sqrt[3]{x+1}$
    • Phân số mọi loại: $\\dfrac{2}{3}$ , $\\dfrac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$
    • Lũy thừa có cơ số hoặc số mũ là biểu thức: $x^{n+1}$ , $(a+b)^2$ , $(-2)^{3}$ , $2^{10}$
    • Tích phân / tổng / giới hạn có cận: $\\int_{0}^{1} x^2\\,dx$ , $\\sum_{k=1}^{n} k$ , $\\lim_{x \\to 0} f(x)$
    • Hệ phương trình, ma trận: $\\begin{cases} x + y = 1 \\\\ x - y = 3 \\end{cases}$
- CHỈ được gõ ASCII trần (KHÔNG có $...$) cho ký hiệu thật sự MỘT HÀNG: số mũ chỉ một chữ số như x^2 ; dấu nhân a*b ; so sánh <= >= != ; tương đương <=> ; suy ra => ; đơn vị cm2 cm3 ; số thập phân ; dấu cộng trừ viết +- .
- Không trộn nửa ASCII nửa LaTeX trong cùng một biểu thức. Một biểu thức: hoặc toàn ASCII, hoặc toàn LaTeX trong $...$.
- Nếu một biểu thức có căn hoặc phân số thì CẢ biểu thức đó phải nằm gọn trong MỘT cặp $...$ (kể cả phần số/biến đứng ngoài căn): viết $2\\sqrt{3} + 1$ chứ KHÔNG viết 2$\\sqrt{3}$+1 ; viết $\\dfrac{\\sqrt{80}}{5}$ chứ KHÔNG viết $\\sqrt{80}$/5 .

━━━━━━━━━━━━━━ SỐ LƯỢNG CÂU HỎI ━━━━━━━━━━━━━━
Nếu ở phần bổ sung phía dưới KHÔNG ghi yêu cầu số lượng cụ thể: hãy tạo khoảng 6 câu cho PHAN_1 (đủ cả TN, DUNG_SAI, DIEN_TU) và 2–3 câu TU_LUAN cho PHAN_2, phân bố trải đều 4 mức độ từ Nhan_Biet đến Van_Dung_Cao.
Nếu CÓ ghi yêu cầu số lượng: tuân thủ đúng số lượng và đúng loại × mức độ được yêu cầu.

━━━━━━━━━━━━━━ KHUNG MẪU — giữ nguyên cấu trúc, thay <...> bằng nội dung thật ━━━━━━━━━━━━━━

=PHAN_1_TRAC_NGHIEM=
[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: <nội dung câu trắc nghiệm>
A. <lựa chọn A>
B. <lựa chọn B>
C. <lựa chọn C>
D. <lựa chọn D>
Dap_An: A
Loi_Giai: <giải thích>

[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Thong_Hieu
De_Bai: <một nhận định>
Dap_An: Dung
Loi_Giai: <giải thích>

[CAU_HOI]
Loai: DIEN_TU
Muc_Do: Van_Dung
De_Bai: <câu hỏi có ___ ở chỗ trống>
Dap_An: <đáp án cần điền>
Loi_Giai: <giải thích>

=PHAN_2_TU_LUAN=
[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Van_Dung_Cao
De_Bai: <đề bài tự luận>
So_Dong_Nhap: 8
Loi_Giai: <hướng dẫn chấm và các bước giải chi tiết>

[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Van_Dung
De_Bai: <phần dẫn chung>
a) <yêu cầu ý a>
b) <yêu cầu ý b>
So_Dong_Nhap: 8
Loi_Giai: Lời giải từng ý:
a) <lời giải ý a>
b) <lời giải ý b>

LƯU Ý DÀNH RIÊNG CHO CLAUDE: Không mở đầu câu trả lời bằng bất kỳ câu dẫn nào, kể cả một câu ngắn xác nhận yêu cầu ("Đây là đề kiểm tra bạn cần:" hay tương tự) — xuất thẳng vào nội dung đề. Nếu đề quá dài phải dừng giữa chừng do giới hạn một lượt trả lời, hãy dừng đúng ngay sau một dòng "Loi_Giai:" hoàn chỉnh của một câu (không dừng giữa chừng một câu đang viết dở), để người dùng có thể yêu cầu viết tiếp phần còn lại.`,
    example: `=PHAN_1_TRAC_NGHIEM=
[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: Cách mạng tháng Tám năm 1945 ở Việt Nam giành chính quyền thắng lợi trong thời gian nào?
A. Từ 14/8 đến 28/8/1945
B. Từ 1/9 đến 15/9/1945
C. Từ 19/8 đến 2/9/1945
D. Từ 6/1 đến 19/1/1946
Dap_An: A
Loi_Giai: Từ ngày 14/8 đến 28/8/1945, cuộc Tổng khởi nghĩa diễn ra và giành thắng lợi trên cả nước, tiêu biểu là khởi nghĩa giành chính quyền ở Hà Nội (19/8), Huế (23/8), Sài Gòn (25/8).

[CAU_HOI]
Loai: TN
Muc_Do: Thong_Hieu
De_Bai: Sự kiện nào đánh dấu Cách mạng tháng Tám năm 1945 thành công, khai sinh ra nước Việt Nam Dân chủ Cộng hòa?
A. Nhật đảo chính Pháp (9/3/1945)
B. Tổng khởi nghĩa giành chính quyền ở Hà Nội (19/8/1945)
C. Chủ tịch Hồ Chí Minh đọc Tuyên ngôn Độc lập (2/9/1945)
D. Hội nghị toàn quốc của Đảng ở Tân Trào (14/8/1945)
Dap_An: C
Loi_Giai: Ngày 2/9/1945, tại Quảng trường Ba Đình, Chủ tịch Hồ Chí Minh đọc bản Tuyên ngôn Độc lập, khai sinh ra nước Việt Nam Dân chủ Cộng hòa - đánh dấu thắng lợi hoàn toàn của Cách mạng tháng Tám.

[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Thong_Hieu
De_Bai: Cách mạng tháng Tám năm 1945 thành công một phần nhờ chớp đúng thời cơ khi phát xít Nhật đầu hàng Đồng minh.
Dap_An: Dung
Loi_Giai: Ngày 15/8/1945, Nhật đầu hàng Đồng minh không điều kiện, tạo thời cơ "ngàn năm có một" để Đảng ta phát động Tổng khởi nghĩa giành chính quyền trước khi quân Đồng minh vào Đông Dương.

[CAU_HOI]
Loai: DIEN_TU
Muc_Do: Van_Dung
De_Bai: Hội nghị toàn quốc của Đảng quyết định phát động Tổng khởi nghĩa được tổ chức tại ___ vào tháng 8/1945.
Dap_An: Tân Trào
Loi_Giai: Hội nghị toàn quốc của Đảng họp tại Tân Trào (Tuyên Quang) từ 14 đến 15/8/1945, quyết định phát động Tổng khởi nghĩa trong cả nước.

=PHAN_2_TU_LUAN=
[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Van_Dung_Cao
De_Bai: Trình bày nguyên nhân thắng lợi và ý nghĩa lịch sử của Cách mạng tháng Tám năm 1945.
So_Dong_Nhap: 10
Loi_Giai: Nguyên nhân thắng lợi: (1) Có sự lãnh đạo đúng đắn, sáng suốt của Đảng và Chủ tịch Hồ Chí Minh; (2) Truyền thống yêu nước, tinh thần đoàn kết của toàn dân tộc trong Mặt trận Việt Minh; (3) Chớp đúng thời cơ khi phát xít Nhật đầu hàng Đồng minh. Ý nghĩa lịch sử: Đập tan ách thống trị của thực dân, phát xít và chế độ phong kiến, lập nên nước Việt Nam Dân chủ Cộng hòa - nhà nước công nông đầu tiên ở Đông Nam Á; mở ra kỷ nguyên độc lập, tự do cho dân tộc; góp phần cổ vũ phong trào giải phóng dân tộc trên thế giới.`,
  },
  {
    id: "grok",
    label: "Grok",
    hint: "Dán vào Grok tại grok.com hoặc trong ứng dụng X (Twitter).",
    exampleTopic: "Tin học 6 - Mạng máy tính và Internet",
    template: `Bạn là chuyên gia khảo thí và biên soạn đề kiểm tra. Hãy soạn nội dung đề kiểm tra về chủ đề [NHẬP MÔN HỌC/CHỦ ĐỀ Ở ĐÂY].

Kết quả của bạn sẽ được một PHẦN MỀM ĐỌC TỰ ĐỘNG, không phải con người đọc. Vì vậy phải tuân thủ TUYỆT ĐỐI định dạng bên dưới. Chỉ cần sai một chi tiết là phần mềm sẽ báo lỗi hoặc hiểu sai nội dung.

━━━━━━━━━━━━━━ QUY TẮC XUẤT KẾT QUẢ (bắt buộc) ━━━━━━━━━━━━━━
1. CHỈ xuất ra nội dung đề theo đúng định dạng dưới đây. TUYỆT ĐỐI KHÔNG viết lời chào, lời dẫn ("Dưới đây là đề..."), ghi chú, lời kết. KHÔNG đặt kết quả trong khối mã / code block. KHÔNG dùng ký hiệu markdown (dấu sao, dấu thăng, gạch đầu dòng, bảng...).
2. Đề gồm ĐÚNG 2 phần. Mỗi phần mở đầu bằng một dòng header viết y hệt, chữ IN HOA không dấu, có dấu "=" ở hai đầu, NẰM MỘT MÌNH TRÊN DÒNG và có một dòng trống ngay phía trước:
      =PHAN_1_TRAC_NGHIEM=   → chứa mọi câu loại TN, DUNG_SAI, DIEN_TU
      =PHAN_2_TU_LUAN=       → chỉ chứa câu loại TU_LUAN
3. Mỗi câu hỏi bắt đầu bằng đúng dòng:  [CAU_HOI]  — nằm một mình trên dòng, có một dòng trống ngay phía trước. TUYỆT ĐỐI không nối "[CAU_HOI]" hay dòng header vào cuối dòng "Loi_Giai:" của câu trước.
4. Mỗi câu chỉ được có DUY NHẤT một dòng "Dap_An:" và DUY NHẤT một dòng "Loi_Giai:". Hãy suy nghĩ và tự kiểm tra thật kỹ TRƯỚC khi viết, rồi chỉ ghi ra đáp án CUỐI CÙNG mà bạn chắc chắn đúng. Không được ghi "Dap_An:" hoặc "Loi_Giai:" lần thứ hai để tự sửa lại trong cùng một câu.
5. Mỗi trường viết trên MỘT dòng, đúng dạng "Tên_Trường: giá trị". Tên trường viết y hệt (Loai, Muc_Do, De_Bai, Dap_An, Loi_Giai, So_Dong_Nhap) — không dịch, không đổi, không thêm khoảng trắng trong tên. Nội dung "De_Bai:" viết liền trên một dòng, KHÔNG xuống dòng giữa câu — ngoại lệ DUY NHẤT là các ý nhỏ a) b) c)… theo quy tắc 6 — và KHÔNG bắt đầu bất kỳ dòng nào bằng "A." … "D." hay bằng tên một trường.
6. CÂU CÓ NHIỀU Ý NHỎ (thường là TU_LUAN): dòng "De_Bai:" chỉ ghi phần dẫn chung (dữ kiện, biểu thức, hình vẽ được mô tả…). Sau đó MỖI Ý NHỎ VIẾT TRÊN MỘT DÒNG RIÊNG ngay bên dưới, theo thứ tự, mỗi dòng bắt đầu bằng chữ cái thường + dấu ngoặc đóng + một dấu cách: "a) ", "b) ", "c) ", "d) ", "e) ". TUYỆT ĐỐI KHÔNG dồn nhiều ý vào cùng một dòng (sai: "De_Bai: Cho A = … a) Tính … b) Tìm …"). KHÔNG đánh số ý bằng "1)", "1.", "a.", "A.", "Ý 1:" hay gạch đầu dòng; KHÔNG để dòng trống giữa các ý. Với TU_LUAN, các dòng ý nằm NGAY SAU dòng "De_Bai:" và TRƯỚC dòng "So_Dong_Nhap:". Lời giải cũng trình bày như vậy: dòng "Loi_Giai:" ghi phần chung (nếu có, hoặc ghi "Lời giải từng ý:"), rồi lời giải mỗi ý trên một dòng riêng bắt đầu bằng "a) ", "b) "… đúng thứ tự như đề. Nếu các ý khác mức độ, ghi Muc_Do theo ý khó nhất.

━━━━━━━━━━━━━━ TỪ VỰNG BẮT BUỘC ━━━━━━━━━━━━━━
Trường Loai — viết đúng MỘT trong 4 giá trị:  TN  |  DUNG_SAI  |  DIEN_TU  |  TU_LUAN
Trường Muc_Do — viết đúng MỘT trong 4 giá trị:  Nhan_Biet  |  Thong_Hieu  |  Van_Dung  |  Van_Dung_Cao

━━━━━━━━━━━━━━ ĐỊNH DẠNG CHI TIẾT TỪNG LOẠI CÂU ━━━━━━━━━━━━━━

• TN — trắc nghiệm 4 lựa chọn:
  [CAU_HOI]
  Loai: TN
  Muc_Do: <mức độ>
  De_Bai: <nội dung câu hỏi, một dòng>
  A. <nội dung lựa chọn A>
  B. <nội dung lựa chọn B>
  C. <nội dung lựa chọn C>
  D. <nội dung lựa chọn D>
  Dap_An: <MỘT chữ cái: A hoặc B hoặc C hoặc D — phải trùng đúng một lựa chọn ở trên>
  Loi_Giai: <giải thích vì sao đáp án đó đúng>
  → Bắt buộc đủ 4 lựa chọn, mỗi lựa chọn một dòng riêng, bắt đầu bằng "A. ", "B. ", "C. ", "D. ".

• DUNG_SAI — một nhận định, học sinh xét đúng/sai:
  [CAU_HOI]
  Loai: DUNG_SAI
  Muc_Do: <mức độ>
  De_Bai: <một mệnh đề/nhận định trọn vẹn>
  Dap_An: <đúng một từ:  Dung  hoặc  Sai  — không dấu, viết hoa chữ cái đầu>
  Loi_Giai: <giải thích>

• DIEN_TU — điền vào chỗ trống:
  [CAU_HOI]
  Loai: DIEN_TU
  Muc_Do: <mức độ>
  De_Bai: <câu có chỗ trống, đánh dấu chỗ trống bằng ba dấu gạch dưới:  ___ >
  Dap_An: <từ / cụm từ / số cần điền vào chỗ trống>
  Loi_Giai: <giải thích>

• TU_LUAN — tự luận (CHỈ đặt trong =PHAN_2_TU_LUAN=):
  [CAU_HOI]
  Loai: TU_LUAN
  Muc_Do: <mức độ>
  De_Bai: <đề bài yêu cầu học sinh trình bày lời giải>
  So_Dong_Nhap: <số nguyên dương — số dòng kẻ trống chừa cho học sinh làm bài, ví dụ 5 đến 12>
  Loi_Giai: <hướng dẫn chấm / đáp án / các bước giải chi tiết>

• TU_LUAN có nhiều ý nhỏ — mỗi ý MỘT DÒNG RIÊNG (quy tắc 6):
  [CAU_HOI]
  Loai: TU_LUAN
  Muc_Do: <mức độ của ý khó nhất>
  De_Bai: <phần dẫn chung của câu>
  a) <yêu cầu ý a>
  b) <yêu cầu ý b>
  c) <yêu cầu ý c>
  So_Dong_Nhap: <số dòng kẻ cho cả câu>
  Loi_Giai: Lời giải từng ý:
  a) <lời giải ý a>
  b) <lời giải ý b>
  c) <lời giải ý c>

━━━━━━━━━━━━━━ CÁCH VIẾT CÔNG THỨC TOÁN ━━━━━━━━━━━━━━
- BẮT BUỘC bọc trong $...$ và viết bằng LaTeX chuẩn cho MỌI công thức có cấu trúc 2 chiều (bên trên/bên dưới một gạch ngang):
    • Căn mọi loại: $\\sqrt{80}$ , $\\sqrt{b^2 - 4ac}$ , căn bậc n $\\sqrt[3]{x+1}$
    • Phân số mọi loại: $\\dfrac{2}{3}$ , $\\dfrac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$
    • Lũy thừa có cơ số hoặc số mũ là biểu thức: $x^{n+1}$ , $(a+b)^2$ , $(-2)^{3}$ , $2^{10}$
    • Tích phân / tổng / giới hạn có cận: $\\int_{0}^{1} x^2\\,dx$ , $\\sum_{k=1}^{n} k$ , $\\lim_{x \\to 0} f(x)$
    • Hệ phương trình, ma trận: $\\begin{cases} x + y = 1 \\\\ x - y = 3 \\end{cases}$
- CHỈ được gõ ASCII trần (KHÔNG có $...$) cho ký hiệu thật sự MỘT HÀNG: số mũ chỉ một chữ số như x^2 ; dấu nhân a*b ; so sánh <= >= != ; tương đương <=> ; suy ra => ; đơn vị cm2 cm3 ; số thập phân ; dấu cộng trừ viết +- .
- Không trộn nửa ASCII nửa LaTeX trong cùng một biểu thức. Một biểu thức: hoặc toàn ASCII, hoặc toàn LaTeX trong $...$.
- Nếu một biểu thức có căn hoặc phân số thì CẢ biểu thức đó phải nằm gọn trong MỘT cặp $...$ (kể cả phần số/biến đứng ngoài căn): viết $2\\sqrt{3} + 1$ chứ KHÔNG viết 2$\\sqrt{3}$+1 ; viết $\\dfrac{\\sqrt{80}}{5}$ chứ KHÔNG viết $\\sqrt{80}$/5 .

━━━━━━━━━━━━━━ SỐ LƯỢNG CÂU HỎI ━━━━━━━━━━━━━━
Nếu ở phần bổ sung phía dưới KHÔNG ghi yêu cầu số lượng cụ thể: hãy tạo khoảng 6 câu cho PHAN_1 (đủ cả TN, DUNG_SAI, DIEN_TU) và 2–3 câu TU_LUAN cho PHAN_2, phân bố trải đều 4 mức độ từ Nhan_Biet đến Van_Dung_Cao.
Nếu CÓ ghi yêu cầu số lượng: tuân thủ đúng số lượng và đúng loại × mức độ được yêu cầu.

━━━━━━━━━━━━━━ KHUNG MẪU — giữ nguyên cấu trúc, thay <...> bằng nội dung thật ━━━━━━━━━━━━━━

=PHAN_1_TRAC_NGHIEM=
[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: <nội dung câu trắc nghiệm>
A. <lựa chọn A>
B. <lựa chọn B>
C. <lựa chọn C>
D. <lựa chọn D>
Dap_An: A
Loi_Giai: <giải thích>

[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Thong_Hieu
De_Bai: <một nhận định>
Dap_An: Dung
Loi_Giai: <giải thích>

[CAU_HOI]
Loai: DIEN_TU
Muc_Do: Van_Dung
De_Bai: <câu hỏi có ___ ở chỗ trống>
Dap_An: <đáp án cần điền>
Loi_Giai: <giải thích>

=PHAN_2_TU_LUAN=
[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Van_Dung_Cao
De_Bai: <đề bài tự luận>
So_Dong_Nhap: 8
Loi_Giai: <hướng dẫn chấm và các bước giải chi tiết>

[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Van_Dung
De_Bai: <phần dẫn chung>
a) <yêu cầu ý a>
b) <yêu cầu ý b>
So_Dong_Nhap: 8
Loi_Giai: Lời giải từng ý:
a) <lời giải ý a>
b) <lời giải ý b>

LƯU Ý DÀNH RIÊNG CHO GROK: Giữ giọng văn nghiêm túc trong toàn bộ nội dung xuất ra — KHÔNG chêm bình luận hài hước, KHÔNG dùng emoji, KHÔNG thêm ghi chú ngoài lề dù chỉ một dòng. Nếu bạn có nhiều chế độ suy luận, hãy chọn chế độ tuân thủ định dạng nghiêm ngặt nhất.`,
    example: `=PHAN_1_TRAC_NGHIEM=
[CAU_HOI]
Loai: TN
Muc_Do: Nhan_Biet
De_Bai: Internet là gì?
A. Một mạng máy tính duy nhất đặt tại một quốc gia
B. Mạng lưới khổng lồ kết nối hàng triệu mạng máy tính trên toàn thế giới
C. Một loại phần mềm diệt virus
D. Một thiết bị lưu trữ dữ liệu
Dap_An: B
Loi_Giai: Internet là mạng lưới kết nối hàng triệu mạng máy tính và thiết bị trên khắp thế giới, cho phép chúng trao đổi dữ liệu với nhau.

[CAU_HOI]
Loai: TN
Muc_Do: Thong_Hieu
De_Bai: Thiết bị nào sau đây dùng để kết nối các máy tính trong một mạng cục bộ (LAN) với nhau?
A. Chuột máy tính
B. Switch (bộ chuyển mạch)
C. Bàn phím
D. Màn hình
Dap_An: B
Loi_Giai: Switch (bộ chuyển mạch) là thiết bị mạng dùng để kết nối nhiều máy tính trong cùng một mạng LAN, cho phép chúng truyền dữ liệu qua lại.

[CAU_HOI]
Loai: DUNG_SAI
Muc_Do: Thong_Hieu
De_Bai: Địa chỉ IP là một dãy số dùng để định danh duy nhất một thiết bị khi tham gia vào mạng.
Dap_An: Dung
Loi_Giai: Mỗi thiết bị kết nối mạng (máy tính, điện thoại...) được cấp một địa chỉ IP để các thiết bị khác có thể nhận diện và gửi dữ liệu đến đúng đích.

[CAU_HOI]
Loai: DIEN_TU
Muc_Do: Van_Dung
De_Bai: Giao thức chuẩn dùng để truyền tải các trang web trên Internet có tên viết tắt là ___.
Dap_An: HTTP
Loi_Giai: HTTP (HyperText Transfer Protocol) là giao thức chuẩn để trình duyệt và máy chủ web trao đổi dữ liệu trang web với nhau.

=PHAN_2_TU_LUAN=
[CAU_HOI]
Loai: TU_LUAN
Muc_Do: Van_Dung_Cao
De_Bai: Em hãy trình bày 3 lợi ích và 2 rủi ro khi sử dụng Internet, đồng thời đề xuất cách phòng tránh các rủi ro đó.
So_Dong_Nhap: 8
Loi_Giai: Lợi ích: (1) Tìm kiếm thông tin, học tập trực tuyến nhanh chóng; (2) Liên lạc, trao đổi với bạn bè, người thân dù ở xa; (3) Giải trí (xem phim, nghe nhạc, chơi game). Rủi ro: (1) Tiếp xúc thông tin sai lệch, độc hại; (2) Bị lộ thông tin cá nhân, lừa đảo trực tuyến. Cách phòng tránh: không chia sẻ thông tin cá nhân cho người lạ, chỉ truy cập trang web uy tín, hỏi ý kiến người lớn khi gặp nội dung/hành vi đáng ngờ.`,
  }
];
