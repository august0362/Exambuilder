# Chủ đề màu (theme) — nguồn & cách thêm

Thư mục này chứa các bảng màu tham khảo (ảnh PNG kiểu Color Hunt). Mỗi ảnh 4 màu;
hex đọc thẳng từ chunk `PLTE` của PNG.

Hiện có **11 chủ đề**, `id` giống nhau ở cả web lẫn Android:

| id | Tên hiển thị | Nền | Từ ảnh |
|---|---|---|---|
| `cold` | Xanh lạnh | sáng | `ColdColor.png` (= `Color Hunt … e3f2fd…`) |
| `ocean` | Biển | sáng | `Color Hunt … 3368a0…` |
| `meadow` | Đồng cỏ | sáng | `Color Hunt … 499a13…` |
| `blossom` | Oải hương | sáng | `Color Hunt … fdf4d2…` |
| `sorbet` | Kem trái cây | sáng | `Color Hunt … ff9d9d…` |
| `daylight` | Ban ngày | sáng | `Color Hunt … fff2c6…` |
| `summer` | Hè | sáng | `SummerColor.png` |
| `fall` | Thu | sáng | `FallColor.png` |
| `winter` | Đông | sáng | `WinterColor.png` |
| `midnight` | Xanh đêm | **tối** | `DarkColdColor.png` |
| `pine` | Rừng đêm | **tối** | `DarkWinterColor.png` |

---

## Thêm 1 chủ đề mới — bạn tự làm được, không cần AI

Tự thêm được nếu quen sửa CSS + Kotlin cơ bản. Chỉ là chép 1 khối rồi đổi mã màu.

### A. Web (2 chỗ)

**1. `frontend/style.css`** — thêm 1 khối ngay trước `:root[data-theme="midnight"]`
(chép từ khối `ocean` rồi đổi hết mã màu; đủ **20 biến**, chủ đề tối thì thêm dòng
`color-scheme: dark;`):

```css
:root[data-theme="sunset"] {
  --color-primary: #d1495b;        /* màu nhấn (nút, link) — chữ trắng phải đọc được */
  --color-primary-dark: #a03547;   /* đậm hơn primary một bậc */
  --color-primary-soft: #fbe4e7;   /* nền nút phụ (rất nhạt) */
  --color-primary-soft-br: #f0b8c0; /* viền nút phụ */
  --color-on-primary: #ffffff;     /* chữ TRÊN màu primary (chủ đề tối: dùng màu nền tối) */
  --color-bg: #fdf1f0;             /* nền trang */
  --color-surface: #ffffff;        /* nền thẻ / modal / ô nhập */
  --color-surface-2: #f8e7e5;      /* nền phụ nhạt hơn surface */
  --color-border: #edd3d1;
  --color-text: #3a1f22;           /* chữ chính — tương phản >= 4.5:1 với bg và surface */
  --color-text-muted: #7a5257;     /* chữ phụ — vẫn phải >= 4.5:1 với bg */
  --color-line: #c99ea2;           /* gạch nháp tự luận + thanh cuộn */
  --color-switch-off: #e8c4c1;
  --color-overlay: rgba(58, 31, 34, 0.45);
  --color-correct-bg: #e6f0e5;     /* nền lựa chọn đúng */
  --color-expl-bg: #fdeede;        /* nền ô lời giải */
  --color-expl-border: #c98a3a;
  --color-code-bg: #35201f;        /* nền khối "Prompt mẫu" */
  --color-code-text: #f2e2e0;
  --color-th: #d1495b;             /* màu badge "Thông hiểu" — chữ trắng phải đọc được */
}
```

Và 1 dòng preview (gần cuối file, cạnh các dòng `.theme-card-preview[data-p=...]`):

```css
.theme-card-preview[data-p="sunset"] { background: #fdf1f0; }
.theme-card-preview[data-p="sunset"] .tcp-bar { background: #d1495b; }
.theme-card-preview[data-p="sunset"] .tcp-dot { background: #edaeb4; }
```

**2. `frontend/index.html`** — thêm 1 nút trong `<div class="theme-grid" id="themeGrid">`:

```html
<button type="button" class="theme-card" data-theme="sunset">
  <span class="theme-card-preview" data-p="sunset"><span class="tcp-bar"></span><span class="tcp-dot"></span></span>
  <span class="theme-card-name">Hoàng hôn</span>
</button>
```

Xong. `script.js` tự lấy danh sách theme từ các nút này, không phải sửa. Tải lại trang.

### B. Android (1 chỗ + build lại)

`Exam builder for adr/app/src/main/java/com/exambuilder/android/ui/theme/Palettes.kt` —
thêm 1 phần tử vào list `APP_THEMES` (chép từ `ocean`, dùng `lightColorScheme` cho nền
sáng / `darkColorScheme` cho nền tối):

```kotlin
AppTheme(
    id = "sunset", label = "Hoàng hôn", dark = false,
    previewBg = c(0xFDF1F0), previewBar = c(0xD1495B), previewDot = c(0xEDAEB4),
    scheme = lightColorScheme(
        primary = c(0xD1495B), onPrimary = Color.White,
        primaryContainer = c(0xFBE4E7), onPrimaryContainer = c(0xA03547),
        secondary = c(0x4A7194), onSecondary = Color.White,
        background = c(0xFDF1F0), onBackground = c(0x3A1F22),
        surface = c(0xFFFFFF), onSurface = c(0x3A1F22),
        surfaceVariant = c(0xF8E7E5), onSurfaceVariant = c(0x7A5257),
        outline = c(0xC99EA2), outlineVariant = c(0xEDD3D1), error = c(0xB3261E)
    )
),
```

`SettingsScreen` render lưới theo `APP_THEMES` nên tự hiện; `AppSettingsStore` tự bỏ
qua id lạ. Rồi build lại APK (xem `../../Exam builder for adr/README.md` mục "Bản release").

### C. Kiểm tra tương phản (WCAG AA) — dán vào `node`

```js
const lum = h => { h = h.replace('#',''); const c = h.match(/../g).map(x => parseInt(x,16)/255)
  .map(v => v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4));
  return 0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2]; };
const cr = (a,b) => { const l1 = Math.max(lum(a),lum(b)), l2 = Math.min(lum(a),lum(b)); return (l1+0.05)/(l2+0.05); };
// đổi các hex bên dưới cho khớp theme của bạn:
const bg='#fdf1f0', surface='#ffffff', text='#3a1f22', muted='#7a5257', primary='#d1495b', onP='#ffffff', th='#d1495b';
console.log('text/bg     ', cr(text,bg).toFixed(2),  cr(text,bg)>=4.5?'OK':'FAIL');
console.log('muted/bg    ', cr(muted,bg).toFixed(2), cr(muted,bg)>=4.5?'OK':'FAIL');
console.log('text/surface', cr(text,surface).toFixed(2), cr(text,surface)>=4.5?'OK':'FAIL');
console.log('white/primary', cr(onP,primary).toFixed(2), cr(onP,primary)>=4.5?'OK':'FAIL');
console.log('white/th    ', cr('#ffffff',th).toFixed(2), cr('#ffffff',th)>=4.5?'OK':'FAIL');
```

Tất cả phải `OK` (>= 4.5). Nếu FAIL: nền quá đậm → làm nhạt hơn; hoặc chữ/primary
quá nhạt → làm đậm hơn.

---

## Nên dùng AI hay tự làm?

- **Tự làm:** hoàn toàn được — chỉ là chép khối + đổi hex + chạy đoạn kiểm tra ở mục C,
  rồi build lại APK cho Android. Không cần công cụ build gì thêm cho web.
- **Nhờ AI:** nhanh hơn ở khâu chọn/tinh chỉnh hex cho vừa tông + đạt tương phản, và
  khâu build + ký lại APK Android. Không bắt buộc.
