package com.exambuilder.android.math

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

/**
 * Kiem tra ban port Kotlin [MathPromote.promote] khop TUNG vector voi ban
 * web (backend/parser/mathToLatex.js). Bang vector chung:
 * `tests/parser/mathPromoteVectors.json` - NGUON DUY NHAT, doc thang tu do
 * (khong chep tay) de khong bao gio lech.
 *
 * GHI CHU MOI TRUONG: theo project note, JVM unit test cua module Android
 * KHONG chay duoc cuc bo (duong dan co dau cach + dau tieng Viet). File nay
 * "da viet, chua chay local" - build APK release thanh cong la tieu chi thay the.
 */
class MathPromoteTest {

    private data class Vec(val id: String, val input: String, val expected: String)

    private fun loadVectors(): List<Vec> {
        val candidates = listOf(
            "../../tests/parser/mathPromoteVectors.json",   // wd = <repo>/Exam builder for adr/app
            "../tests/parser/mathPromoteVectors.json",       // wd = <repo>/Exam builder for adr
            "tests/parser/mathPromoteVectors.json",          // wd = <repo>
            "../../../tests/parser/mathPromoteVectors.json"
        )
        val file: File = candidates.map { File(it) }.firstOrNull { it.exists() }
            ?: error("mathPromoteVectors.json khong tim thay tu ${File(".").absolutePath}")
        return Json.parseToJsonElement(file.readText()).jsonArray.map {
            val o = it.jsonObject
            Vec(o["id"]!!.jsonPrimitive.content, o["input"]!!.jsonPrimitive.content, o["expected"]!!.jsonPrimitive.content)
        }
    }

    @Test
    fun `promote khop bang vector chung voi ban web`() {
        val vectors = loadVectors()
        assert(vectors.size >= 20) { "Bang vector phai co >= 20 ca, hien ${vectors.size}" }
        for (v in vectors) {
            val once = MathPromote.promote(v.input)
            assertEquals("[${v.id}] output", v.expected, once)
            assertEquals("[${v.id}] idempotent", once, MathPromote.promote(once))
        }
    }

    @Test
    fun `promote an toan voi null va rong`() {
        assertEquals("", MathPromote.promote(null))
        assertEquals("", MathPromote.promote(""))
    }
}
