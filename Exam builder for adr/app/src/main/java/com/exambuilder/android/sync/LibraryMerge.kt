package com.exambuilder.android.sync

import com.exambuilder.android.data.dto.LIBRARY_SCHEMA
import com.exambuilder.android.data.dto.LibraryFile
import com.exambuilder.android.data.dto.LibraryJson
import com.exambuilder.android.data.dto.SavedExamDto
import com.exambuilder.android.data.dto.ThemeDto
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import java.time.Instant
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

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

    /**
     * Ban "nghiem" cua [parse] cho noi dung lay tu Gist khi dong bo: vang mat /
     * rong -> thu vien rong (lan push dau tien); co noi dung nhung hong -> NEM
     * LOI. Neu coi noi dung hong la "rong" thi Push se ghi de mat sach cloud.
     */
    fun parseStrict(raw: String?): LibraryFile {
        if (raw.isNullOrBlank()) return emptyLibrary()
        val lib = runCatching {
            val json = LibraryJson.parseToJsonElement(raw)
            check(json is JsonObject && json["exams"] is JsonArray)
            LibraryJson.decodeFromString(LibraryFile.serializer(), raw)
        }.getOrElse {
            throw IllegalStateException("Nội dung thư viện trên Gist bị hỏng (không phải JSON hợp lệ). Đã dừng đồng bộ để tránh mất dữ liệu.")
        }
        if (lib.exams.any { it.examId.isBlank() }) {
            throw IllegalStateException("Nội dung thư viện trên Gist có mục đề bị hỏng. Đã dừng đồng bộ để tránh mất dữ liệu.")
        }
        return lib
    }

    fun stringify(library: LibraryFile): String =
        LibraryJson.encodeToString(LibraryFile.serializer(), library)

    // --- Moc thoi gian (giong parseTime/clampIso trong library.js) -----------

    private val SQLITE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
    private const val MAX_CLOCK_SKEW_SECONDS = 86_400L

    /** ISO 8601 (Z hoac +07:00, co/khong ms) hoac SQLite 'yyyy-MM-dd HH:mm:ss' (UTC). Sai -> null. */
    fun parseTime(raw: String?): Instant? {
        val s = raw?.trim().orEmpty()
        if (s.isEmpty()) return null
        return runCatching { Instant.parse(s) }
            .recoverCatching { OffsetDateTime.parse(s).toInstant() }
            .recoverCatching { LocalDateTime.parse(s, SQLITE_TIME).toInstant(ZoneOffset.UTC) }
            .getOrNull()
    }

    /** Moc dung de so sanh "ban nao moi hon". Thieu / sai -> 0 (luon thua). */
    private fun examTime(e: SavedExamDto): Long = parseTime(e.updatedAt)?.toEpochMilli() ?: 0L

    // Chong lech dong ho: moc tuong lai qua 24h (vd. nam 9999) bi kep ve "bay gio".
    private fun clamp(raw: String?, now: Instant): String? {
        val t = parseTime(raw) ?: return raw
        return if (t.isAfter(now.plusSeconds(MAX_CLOCK_SKEW_SECONDS))) now.toString() else raw
    }

    private fun normalize(e: SavedExamDto, now: Instant): SavedExamDto =
        e.copy(createdAt = clamp(e.createdAt, now), updatedAt = clamp(e.updatedAt, now), deletedAt = clamp(e.deletedAt, now))

    /** Them [e] vao [byId] theo LWW; bang moc -> ban them sau thang. */
    private fun putNewer(byId: MutableMap<String, SavedExamDto>, e: SavedExamDto) {
        val old = byId[e.examId]
        if (old == null || examTime(e) >= examTime(old)) byId[e.examId] = e
    }

    /**
     * Hop nhat theo exam_id, union toan bo id o ca 2 ben. Trung id -> "lan doi
     * gan nhat thang" (Last-Write-Wins) theo updated_at; tombstone cung chi la 1
     * phien ban, thang khi moi hon. Bang moc -> primary thang. Trung id trong
     * CUNG 1 ben -> giu ban moi hon.
     *   - Pull : merge(cloud, local)  -> ghi ket qua vao may
     *   - Push : merge(local, cloud)  -> ghi ket qua len Gist
     */
    fun merge(primary: LibraryFile, secondary: LibraryFile): LibraryFile {
        val now = Instant.now()
        val byId = LinkedHashMap<String, SavedExamDto>()
        for (e in secondary.exams) putNewer(byId, normalize(e, now))
        val fromPrimary = LinkedHashMap<String, SavedExamDto>()
        for (e in primary.exams) putNewer(fromPrimary, normalize(e, now))
        for (e in fromPrimary.values) putNewer(byId, e)
        val exams = byId.values.sortedByDescending { examTime(it) }
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
        return parseTime(iso)?.toEpochMilli() ?: 0L
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
            val t = parseTime(del) ?: return@filter true
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
