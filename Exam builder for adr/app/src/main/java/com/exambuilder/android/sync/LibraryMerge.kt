package com.exambuilder.android.sync

import com.exambuilder.android.data.dto.LIBRARY_SCHEMA
import com.exambuilder.android.data.dto.LibraryFile
import com.exambuilder.android.data.dto.LibraryJson
import com.exambuilder.android.data.dto.SavedExamDto
import com.exambuilder.android.data.dto.ThemeDto
import java.time.Instant

/**
 * Cung logic voi backend/sync/library.js. Giu 2 ban song song dong bo khi sua.
 */
object LibraryMerge {

    fun nowIso(): String = Instant.now().toString()

    fun emptyLibrary(): LibraryFile = LibraryFile(schema = LIBRARY_SCHEMA, updatedAt = nowIso(), exams = emptyList())

    /** Chuoi JSON tho -> LibraryFile. JSON hong / cau truc sai -> thu vien rong (khong nem). */
    fun parse(raw: String?): LibraryFile {
        if (raw.isNullOrBlank()) return emptyLibrary()
        return runCatching {
            val lib = LibraryJson.decodeFromString(LibraryFile.serializer(), raw)
            lib.copy(exams = lib.exams.filter { it.examId.isNotBlank() })
        }.getOrElse { emptyLibrary() }
    }

    fun stringify(library: LibraryFile): String =
        LibraryJson.encodeToString(LibraryFile.serializer(), library)

    /**
     * Hop nhat theo exam_id, "primary thang" tuyet doi khi trung id; union
     * toan bo id o ca 2 ben.
     *   - Pull : merge(cloud, local)  -> ghi ket qua vao may
     *   - Push : merge(local, cloud)  -> ghi ket qua len Gist
     */
    fun merge(primary: LibraryFile, secondary: LibraryFile): LibraryFile {
        val byId = LinkedHashMap<String, SavedExamDto>()
        for (e in secondary.exams) byId[e.examId] = e
        for (e in primary.exams) byId[e.examId] = e
        val exams = byId.values.sortedByDescending { it.updatedAt ?: "" }
        return LibraryFile(
            schema = LIBRARY_SCHEMA,
            updatedAt = nowIso(),
            theme = pickNewerTheme(primary.theme, secondary.theme),
            exams = exams
        )
    }

    // --- Chu de mau: "lan doi gan nhat thang" (giu giong backend/sync/library.js) ---
    private val THEME_ID_RE = Regex("^[a-z][a-z0-9-]{0,39}$")

    private fun sanitizeTheme(t: ThemeDto?): ThemeDto? {
        val id = t?.id?.trim().orEmpty()
        if (!THEME_ID_RE.matches(id)) return null
        return ThemeDto(id = id, updatedAt = t?.updatedAt?.takeIf { it.isNotBlank() })
    }

    private fun themeTime(t: ThemeDto?): Long {
        val iso = t?.updatedAt ?: return 0L
        return runCatching { Instant.parse(iso).toEpochMilli() }.getOrDefault(0L)
    }

    /** Bang moc thoi gian -> giu [primary] de ket qua tat dinh. */
    fun pickNewerTheme(primary: ThemeDto?, secondary: ThemeDto?): ThemeDto? {
        val p = sanitizeTheme(primary)
        val s = sanitizeTheme(secondary)
        if (p == null) return s
        if (s == null) return p
        return if (themeTime(s) > themeTime(p)) s else p
    }

    /** Bo tombstone cu hon [days] ngay (mac dinh 90). */
    fun purgeOldTombstones(library: LibraryFile, days: Long = 90): LibraryFile {
        val cutoff = Instant.now().minusSeconds(days * 86_400)
        val kept = library.exams.filter { e ->
            val del = e.deletedAt ?: return@filter true
            val t = runCatching { Instant.parse(del) }.getOrNull() ?: return@filter true
            !t.isBefore(cutoff)
        }
        return library.copy(schema = LIBRARY_SCHEMA, updatedAt = nowIso(), exams = kept)
    }

    fun summarize(library: LibraryFile): Triple<Int, Int, Int> {
        val total = library.exams.size
        val active = library.exams.count { !it.isDeleted }
        return Triple(total, active, total - active)
    }
}
