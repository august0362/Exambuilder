# ExamBuilder for Android

Native Kotlin + Jetpack Compose companion app to the web ExamBuilder (`../frontend`, `../backend`). Lets a teacher author an exam, preview it in student/teacher mode, and export it as an A4 PDF directly from a phone or tablet — no server dependency.

## Stack

- Kotlin, Jetpack Compose (Material 3), Navigation-Compose
- `minSdk 26` (Android 8.0) / `targetSdk 36`; bản hiện tại **1.2.0** (`versionCode 3`)
- No third-party PDF library — PDF export uses the platform `android.graphics.pdf.PdfDocument` API

## File tree

```
Exam builder for adr/
├── settings.gradle.kts
├── build.gradle.kts                 # root plugin versions
├── gradle.properties
├── gradle/wrapper/gradle-wrapper.properties
└── app/
    ├── build.gradle.kts             # app module: deps, minSdk 26 / targetSdk 34
    ├── proguard-rules.pro
    └── src/main/
        ├── AndroidManifest.xml      # launcher activity + FileProvider (PDF sharing)
        ├── java/com/exambuilder/android/
        │   ├── MainActivity.kt
        │   ├── model/Exam.kt              # Exam/QuestionBlock/Question/QuestionOption
        │   │                               #  - mirrors the web app's JSON schema
        │   ├── data/
        │   │   ├── dto/LibraryDto.kt          # @Serializable DTO khớp exambuilder-library.json + mapper <-> model/Exam.kt
        │   │   ├── ExamArchiveRepository.kt   # kho đề cục bộ = filesDir/exam-library.json (upsert / xóa mềm / replaceAll)
        │   │   ├── SyncSettingsStore.kt       # DataStore: github_token / gist_id / last_synced_at (plaintext)
        │   │   └── AppSettingsStore.kt        # DataStore: theme_id (+ theme_updated_at, đồng bộ Gist) / font_scale (cục bộ)
        │   ├── sync/
        │   │   ├── LibraryMerge.kt            # mergeLibraries "primary thắng" + pickNewerTheme "lần đổi gần nhất thắng" — giống hệt backend/sync/library.js
        │   │   ├── GistClient.kt              # GitHub Gist API qua HttpURLConnection (get/create/update)
        │   │   └── SyncManager.kt             # push (máy->Gist) / pull (Gist->máy)
        │   ├── viewmodel/ExamViewModel.kt # in-memory exam state (+ loadExam / currentExamId cho Kho đề)
        │   ├── viewmodel/LibraryViewModel.kt # state màn "Kho đề": danh sách + cấu hình + Push/Pull + autosave
        │   ├── export/PdfExporter.kt      # renders Exam -> multi-page A4 PDF
        │   ├── ui/theme/{Color,Type,Theme,Palettes}.kt  # 11 chủ đề ColorScheme (9 sáng + 2 tối) + Typography.scaled(factor)
        │   ├── ui/navigation/ExamBuilderNavHost.kt  # bottom-nav: Soạn đề / Xem trước / Xuất file / Kho đề / Cài đặt
        │   └── ui/screens/
        │       ├── ExamBuilderScreen.kt   # Core UI 1: exam builder view
        │       ├── PreviewScreen.kt       # Core UI 2: preview (số câu liên tục 1..N, chạm để bung câu)
        │       ├── ExportScreen.kt        # Core UI 3: export trigger (PDF + share sheet)
        │       ├── LibraryScreen.kt       # Core UI 4: kho đề (mở lại / xóa) + đồng bộ Gist
        │       └── SettingsScreen.kt      # Core UI 5: 7 chủ đề màu (card preview) / cỡ chữ
        └── res/
            ├── mipmap-anydpi-v26/  # adaptive icon (foreground line-art + nền xanh #2563EB) + monochrome
            ├── mipmap-{m,h,x,xx,xxx}dpi/  # ic_launcher / _round / _foreground PNG theo 5 mật độ
            ├── values/{strings.xml,themes.xml,ic_launcher_background.xml}
            └── xml/{backup_rules.xml,data_extraction_rules.xml,file_paths.xml}
```

App icon được sinh từ `../resources/image/icon.png` (ảnh grayscale) → tách nền → nét vẽ trắng trên
nền xanh thương hiệu `#2563EB`. Đổi ảnh nguồn thì chạy lại `node resources/image/gen-android-icons.js`
(script Node thuần, chỉ dùng `zlib` core) để sinh lại toàn bộ `mipmap-*`.

## Data model

`model/Exam.kt` mirrors the schema produced by `backend/parser/TextPromptParser.js` / `FileUploadParser.js` (`question_type`, `difficulty_level`, `options[].option_key` / `is_correct`, etc.), so an exam authored on either client uses the same shape. `data/dto/LibraryDto.kt` is the `@Serializable` snake-case view of that schema plus sync fields — it is what gets read/written to the Gist and to the local `exam-library.json`, and it maps 1:1 to `model/Exam.kt`.

## Kho đề + Đồng bộ GitHub Gist (PC ↔ Android)

Mọi đề soạn trên máy được **tự động lưu** vào `filesDir/exam-library.json` (debounce 1.2 giây sau thay đổi cuối — xem `LaunchedEffect` trong `ExamBuilderNavHost`). Tab **"Kho đề"** cho mở lại đề để soạn tiếp hoặc **xóa** (xóa mềm — tombstone, chỉ trên máy này).

Đồng bộ dùng **một GitHub Gist secret** làm kho chung, file `exambuilder-library.json` — cùng định dạng và cùng logic merge với web (`backend/sync/library.js`). Khi trùng `exam_id`, bản có `updated_at` mới hơn thắng (kể cả bản xóa mềm); khi bằng thời gian thì bản primary thắng:

| Thao tác | Hướng | Quy tắc |
|---|---|---|
| **⬆️ Đẩy lên** | máy → Gist | `merge(local, cloud)` — giữ bản mới hơn; tự tạo Gist nếu chưa có Gist ID |
| **⬇️ Kéo về** | Gist → máy | `merge(cloud, local)` — giữ bản mới hơn; lấy đề từ thiết bị khác |

Cấu hình trong tab "Kho đề" (Token & Gist ID khóa sau khi lưu, đổi qua nút **🔑 Thay đổi Token** /
**🆔 Thay đổi Gist ID**): thiết bị đầu tiên bấm **🆕 Tạo Gist ID mới**; thiết bị sau dán **cùng
Token + cùng Gist ID** với bên web PC rồi **⬇️ Kéo về**.

> ⚠️ **Bảo mật:** token lưu **plaintext** trong DataStore; Gist secret **không mã hóa** — ai có link Gist đều đọc được toàn bộ đề kèm đáp án. Xem chi tiết ở `../documents/README.md` mục 4.3.

## Cài đặt giao diện (tab "Cài đặt")

`AppSettingsStore` (DataStore `exambuilder_app`) giữ **chủ đề màu** (`cold` / `ocean` / `meadow` /
`blossom` / `sorbet` / `daylight` / `summer` / `fall` / `winter` / `midnight` / `pine` — xem
`ui/theme/Palettes.kt`, mỗi chủ đề là **một `ColorScheme` hoàn chỉnh**, tự nó sáng hoặc tối) và
**cỡ chữ** (`0.9`–`1.3`). Bảng màu chắt lọc từ `../resources/image/theme/`, đồng bộ hex với
`frontend/style.css`, tương phản đạt WCAG AA. `MainActivity` thu 2 giá trị →
`ExamBuilderTheme(themeId, fontScale)`; `fontScale` nhân vào mọi `TextStyle` qua
`Typography.scaled(factor)`. Không có công tắc "chế độ tối" riêng (dùng chủ đề `midnight`/`pine`);
không dùng dynamic color (Material You). `SettingsScreen` = tab thứ 5, lưới card preview mỗi chủ đề.

**Chủ đề màu đồng bộ qua Gist** (`theme_id` thôi): `SyncManager` gắn theme + `theme_updated_at`
vào file thư viện trước khi merge, `LibraryMerge.pickNewerTheme` chọn theo **"lần đổi gần nhất
thắng"**, rồi `applySyncedTheme()` ghi bản thắng về DataStore → `MainActivity` tự đổi giao diện.
**Cỡ chữ KHÔNG đồng bộ** (riêng từng máy).

## Responsive layout

`ExamBuilderScreen` uses `BoxWithConstraints` to switch from a single-column phone layout to a two-pane list/detail layout once available width exceeds ~600dp (tablets, foldables unfolded, split-screen). Compose's density-independent `dp`/`sp` units plus Material 3's dynamic color (Android 12+) cover the rest of the density/OS-version variance down to API 26.

## Building

Compiled and verified locally with the Android SDK/Gradle already installed on this machine — **`app/build/outputs/apk/debug/app-debug.apk`** is a real, built debug APK, ready to install (`adb install app-debug.apk`) or side-load.

To rebuild: open `Exam builder for adr/` in Android Studio and let it sync (it will regenerate `gradle-wrapper.jar`, which isn't committed here), or run `gradle assembleDebug` from this directory with any Gradle 8.9+ install (kho đề + đồng bộ thêm 2 dependency: `kotlinx-serialization-json` và `androidx.datastore:datastore-preferences`, tải về ở lần build đầu).

### Bản release (`ExamBuilder.apk`)

- `gradle :app:prepareAndroidUpdate` → `app/build/outputs/apk/release/ExamBuilder.apk` (đã minify R8 + ký) và `android-update.json` (phiên bản, Android tối thiểu, SHA-256).
- Bản phát hành để side-load: **`ExamBuilder.apk`** (copy từ thư mục output).
- **Ký release** đọc từ `keystore.properties` ở gốc module (KHÔNG commit — xem `.gitignore`). Không có file này thì `assembleRelease` vẫn chạy nhưng ra APK chưa ký (không cài được). Tạo lại:
  ```
  keytool -genkeypair -keystore app/exam-builder-release.jks -alias exambuilder \
    -keyalg RSA -keysize 2048 -validity 10000 -storepass <pw> -keypass <pw> \
    -dname "CN=ExamBuilder, O=ExamBuilder, C=VN"
  ```
  rồi tạo `keystore.properties`:  `storeFile=app/exam-builder-release.jks` / `storePassword` / `keyAlias` / `keyPassword`.
  Giữ file `.jks` an toàn — mọi bản cập nhật sau phải ký bằng đúng khoá này.
- Rules R8 cho `kotlinx.serialization` nằm trong `app/proguard-rules.pro` (thiếu → `LibraryFile.serializer()` lỗi lúc chạy).

> **Note on the parent path:** this repo lives under a folder with Vietnamese diacritics (`Desktop/file nộp bài tập all/...`). AGP hard-fails on non-ASCII project paths by default, so `gradle.properties` sets `android.overridePathCheck=true` to allow it — keep that line if you keep this folder name; it can be removed if the project is ever moved to an ASCII-only path.

## Cập nhật qua GitHub Releases

Trong **Cài đặt → Cập nhật ứng dụng**, xem phiên bản hiện tại, kiểm tra bản mới, tải APK và bấm **Cài đặt bản mới**. App tự kiểm tra khi mở/trở lại màn hình hoặc có mạng Internet được Android xác nhận. Tự kiểm tra tối đa mỗi 6 giờ khi thành công; sau lỗi chờ 5 phút. Nút kiểm tra thủ công bỏ qua thời gian chờ. Không tự tải khi chưa bấm Cập nhật. APK đã tải có thể cài khi ngoại tuyến.

Nguồn mặc định: **`august0362/Exambuilder`**, endpoint `https://api.github.com/repos/august0362/Exambuilder/releases/latest`. Chỉ nhận bản ổn định và `versionCode` lớn hơn bản đang cài. Trước khi cài, kiểm tra kích thước, SHA-256, package, phiên bản và cùng khóa ký. Android vẫn yêu cầu quyền cài ứng dụng từ nguồn này và xác nhận cài đặt.

Mỗi GitHub Release cần **cả `ExamBuilder.apk` và `android-update.json`** từ cùng lần build. Kho và release phải truy cập công khai; ứng dụng không nhúng token GitHub và không dùng token đồng bộ Gist để tải cập nhật. Tại thời điểm triển khai, API của kho trả về 404: cần kiểm tra quyền công khai và xuất bản release trước khi kiểm thử tải trực tuyến. Chi tiết: [ANDROID_UPDATES.md](ANDROID_UPDATES.md).

## Known gaps (scaffold, not a finished app)

- Persistence: kho đề đã được ghi ra file JSON (`ExamArchiveRepository`), nhưng đề **đang soạn dở** vẫn chỉ nằm trong `ExamViewModel` cho tới khi autosave chạy (debounce 1.2s) — chưa khôi phục lại đúng con trỏ soạn khi kill app giữa chừng. Không dùng Room (dữ liệu phi quan hệ, khớp 1:1 với file Gist nên JSON gọn hơn).
- Đồng bộ Gist là **thủ công 2 nút** (Đẩy lên / Kéo về), không tự chạy nền; không giải quyết xung đột theo dòng — giữ cả đề có thời gian cập nhật mới hơn.
- `PdfExporter` does plain-text pagination (no rich text, no stacked-fraction rendering equivalent to the web app's `mathFraction.js`). Good enough for a first export, not a pixel-match of the web PDF.
