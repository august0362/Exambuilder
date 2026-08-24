# ExamBuilder for Android

Native Kotlin + Jetpack Compose companion app to the web ExamBuilder (`../frontend`, `../backend`). Lets a teacher author an exam, preview it in student/teacher mode, and export it as an A4 PDF directly from a phone or tablet — no server dependency.

## Stack

- Kotlin, Jetpack Compose (Material 3), Navigation-Compose
- `minSdk 26` (Android 8.0) / `targetSdk 34`
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
        │   ├── viewmodel/ExamViewModel.kt # in-memory exam state, shared by all 3 screens
        │   ├── export/PdfExporter.kt      # renders Exam -> multi-page A4 PDF
        │   ├── ui/theme/{Color,Type,Theme}.kt
        │   ├── ui/navigation/ExamBuilderNavHost.kt  # bottom-nav: Soạn đề / Xem trước / Xuất file
        │   └── ui/screens/
        │       ├── ExamBuilderScreen.kt   # Core UI 1: exam builder view
        │       ├── PreviewScreen.kt       # Core UI 2: preview renderer (+ student-mode toggle)
        │       └── ExportScreen.kt        # Core UI 3: export trigger (PDF + share sheet)
        └── res/
            ├── values/{strings.xml,themes.xml}
            └── xml/{backup_rules.xml,data_extraction_rules.xml,file_paths.xml}
```

## Data model

`model/Exam.kt` mirrors the schema produced by `backend/parser/TextPromptParser.js` / `FileUploadParser.js` (`question_type`, `difficulty_level`, `options[].option_key` / `is_correct`, etc.), so an exam authored on either client uses the same shape — a future JSON import/export bridge between the two apps (see architecture discussion) would not need a translation layer.

## Responsive layout

`ExamBuilderScreen` uses `BoxWithConstraints` to switch from a single-column phone layout to a two-pane list/detail layout once available width exceeds ~600dp (tablets, foldables unfolded, split-screen). Compose's density-independent `dp`/`sp` units plus Material 3's dynamic color (Android 12+) cover the rest of the density/OS-version variance down to API 26.

## Building

Compiled and verified locally with the Android SDK/Gradle already installed on this machine — **`app/build/outputs/apk/debug/app-debug.apk`** is a real, built debug APK, ready to install (`adb install app-debug.apk`) or side-load.

To rebuild: open `Exam builder for adr/` in Android Studio and let it sync (it will regenerate `gradle-wrapper.jar`, which isn't committed here), or run `gradle assembleDebug` from this directory with any Gradle 8.9+ install.

> **Note on the parent path:** this repo lives under a folder with Vietnamese diacritics (`Desktop/file nộp bài tập all/...`). AGP hard-fails on non-ASCII project paths by default, so `gradle.properties` sets `android.overridePathCheck=true` to allow it — keep that line if you keep this folder name; it can be removed if the project is ever moved to an ASCII-only path.

## Known gaps (scaffold, not a finished app)

- No persistence (Room/DataStore) — exam state lives only in `ExamViewModel` for the session, matching the "core UI" scope requested. Wiring local storage is a natural next step (see also the LAN-sync architecture discussion, which would sit on top of a Room database here).
- `PdfExporter` does plain-text pagination (no rich text, no stacked-fraction rendering equivalent to the web app's `mathFraction.js`). Good enough for a first export, not a pixel-match of the web PDF.
- No app icon asset supplied — manifest currently points at a stock system drawable (`@android:drawable/ic_menu_edit`) as a placeholder.
