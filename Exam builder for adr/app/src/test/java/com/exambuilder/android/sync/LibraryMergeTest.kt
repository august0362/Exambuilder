package com.exambuilder.android.sync

import com.exambuilder.android.data.dto.LibraryFile
import com.exambuilder.android.data.dto.SavedExamDto
import com.exambuilder.android.data.dto.ThemeDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.time.Instant

/** Cung kich ban voi tests/sync/library.test.js (LWW, clamp, dedupe, parseStrict). */
class LibraryMergeTest {
    private val t1 = "2026-01-01T00:00:00Z"
    private val t2 = "2026-01-02T00:00:00Z"

    private fun exam(id: String, title: String, updatedAt: String?, deletedAt: String? = null) =
        SavedExamDto(examId = id, title = title, createdAt = t1, updatedAt = updatedAt, deletedAt = deletedAt)

    private fun lib(vararg exams: SavedExamDto) = LibraryFile(exams = exams.toList())

    private fun merged(primary: LibraryFile, secondary: LibraryFile) = LibraryMerge.merge(primary, secondary).exams

    @Test fun stalePrimaryDoesNotOverwriteNewerSecondary() {
        // Push tu may cam ban cu: cloud (secondary) moi hon phai thang.
        assertEquals("moi", merged(lib(exam("a", "cu", t1)), lib(exam("a", "moi", t2))).single().title)
        // Pull khi local (secondary) moi hon cloud (primary).
        assertEquals("local moi", merged(lib(exam("a", "cloud cu", t1)), lib(exam("a", "local moi", t2))).single().title)
    }

    @Test fun newerTombstoneBeatsOlderLiveCopyBothDirections() {
        val dead = exam("a", "xoa", t2, deletedAt = t2)
        val live = exam("a", "song", t1)
        assertNotNull(merged(lib(live), lib(dead)).single().deletedAt)
        assertNotNull(merged(lib(dead), lib(live)).single().deletedAt)
    }

    @Test fun newerEditBeatsOlderTombstone() {
        val out = merged(lib(exam("a", "xoa", t1, deletedAt = t1)), lib(exam("a", "sua lai", t2))).single()
        assertNull(out.deletedAt)
        assertEquals("sua lai", out.title)
    }

    @Test fun equalTimestampsPrimaryWins() {
        assertEquals("P", merged(lib(exam("a", "P", t1)), lib(exam("a", "S", t1))).single().title)
    }

    @Test fun offsetAndSqliteFormatsCompareAsInstants() {
        // 16:01+07:00 = 09:01Z > 09:00Z (SQLite, coi la UTC)
        val out = merged(lib(exam("a", "sqlite", "2026-01-01 09:00:00")), lib(exam("a", "offset", "2026-01-01T16:01:00+07:00")))
        assertEquals("offset", out.single().title)
    }

    @Test fun themeTimestampsWithOffsetsCompareAsInstants() {
        val out = LibraryMerge.pickNewerTheme(
            ThemeDto("cold", "2026-05-01T00:00:00Z"),
            ThemeDto("ocean", "2026-05-01T07:01:00+07:00")
        )
        assertEquals("ocean", out?.id)
    }

    @Test fun garbageTimestampLosesWithoutThrowing() {
        assertEquals("that", merged(lib(exam("a", "rac", "not-a-date")), lib(exam("a", "that", t1))).single().title)
        assertEquals("that", merged(lib(exam("a", "rac", null)), lib(exam("a", "that", t1))).single().title)
    }

    @Test fun farFutureTimestampIsClamped() {
        val out = merged(lib(exam("a", "9999", "9999-12-31T23:59:59Z")), lib()).single()
        val t = LibraryMerge.parseTime(out.updatedAt)!!
        assertTrue(t.isBefore(Instant.now().plusSeconds(86_400 + 60)))
        // ...nen 1 ban sua that ve sau van thang duoc.
        val later = Instant.now().plusSeconds(3600).toString()
        assertEquals("sua sau", merged(lib(out), lib(exam("a", "sua sau", later))).single().title)
    }

    @Test fun duplicateIdsInOneLibraryKeepNewest() {
        val out = merged(lib(exam("a", "moi", t2), exam("a", "cu", t1)), lib())
        assertEquals(1, out.size)
        assertEquals("moi", out.single().title)
    }

    @Test fun parseStrictAbsentContentIsEmpty() {
        for (raw in listOf(null, "", "   ")) assertTrue(LibraryMerge.parseStrict(raw).exams.isEmpty())
    }

    @Test fun parseStrictMalformedContentThrows() {
        for (raw in listOf("{ hong", "[]", "\"chuoi\"", "{\"exams\": {}}", "{\"khong_co_exams\": 1}", "null")) {
            try {
                LibraryMerge.parseStrict(raw)
                fail("phai nem loi voi: $raw")
            } catch (e: IllegalStateException) {
                assertTrue(e.message!!.contains("bị hỏng"))
            }
        }
    }

    @Test fun parseStrictRejectsEntryWithoutId() {
        val raw = """{"schema":"exambuilder/library@1","exams":[{"exam_id":"a","title":"x"},{"exam_id":"","title":"thieu id"}]}"""
        try {
            LibraryMerge.parseStrict(raw)
            fail("phai dung dong bo neu co muc thieu id")
        } catch (e: IllegalStateException) {
            assertTrue(e.message!!.contains("mục đề bị hỏng"))
        }
    }

    @Test fun purgeAfterMergeDoesNotResurrectOldTombstone() {
        val old = "2026-01-02T00:00:00Z"
        val local = lib(exam("a", "xoa", old, deletedAt = old))
        val cloud = lib(exam("a", "song cu", "2026-01-01T00:00:00Z"))
        val out = LibraryMerge.purgeOldTombstones(LibraryMerge.merge(local, cloud), days = 1)
        assertTrue(out.exams.none { it.examId == "a" && !it.isDeleted })
    }
}
