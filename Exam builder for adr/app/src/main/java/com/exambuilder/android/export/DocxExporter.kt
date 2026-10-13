package com.exambuilder.android.export

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import androidx.core.content.FileProvider
import com.exambuilder.android.math.LatexImage
import com.exambuilder.android.math.MathConvert
import com.exambuilder.android.math.MathNode
import com.exambuilder.android.math.parseMathNodes
import com.exambuilder.android.model.Exam
import com.exambuilder.android.model.Question
import com.exambuilder.android.model.QuestionType
import com.exambuilder.android.model.TemplatePaper
import com.exambuilder.android.model.TemplateSlot
import com.exambuilder.android.model.templateLayout
import java.io.BufferedOutputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/**
 * Writes an [Exam] to a real Word `.docx` by emitting the OOXML package by
 * hand (no Apache POI). Formulas (`$…$`, `\begin{cases}`, …) are rendered
 * with JLaTeXMath and embedded as inline PNG images; the rest is real text.
 * `^{…}` / `_{…}` outside `$` still become genuine `<w:vertAlign>` runs.
 */
object DocxExporter {

    private const val EMU_PER_PX = 9525          // 96 dpi
    private const val FORMULA_TEXT_PX = 15f       // ≈ 11 pt body text
    private const val FORMULA_SCALE = 3f          // rasterise at 3× then display down

    private const val GREEN = "15803D"
    private const val AMBER = "92400E"

    fun export(context: Context, exam: Exam, studentMode: Boolean = false): Uri {
        val b = DocBuilder()
        val layout = exam.templateLayout()
        buildBody(b, exam, studentMode)

        val out = File(context.getExternalFilesDir("exports"), exam.exportFileStem() + ".docx")
        out.parentFile?.mkdirs()
        ZipOutputStream(BufferedOutputStream(FileOutputStream(out))).use { zip ->
            zip.entry("[Content_Types].xml", contentTypes())
            zip.entry("_rels/.rels", PACKAGE_RELS)
            zip.entry("word/document.xml", document(b.body.toString(), layout?.paper))
            if (b.images.isNotEmpty()) {
                zip.entry("word/_rels/document.xml.rels", documentRels(b.images.size))
                b.images.forEachIndexed { i, png ->
                    zip.putNextEntry(ZipEntry("word/media/image${i + 1}.png"))
                    zip.write(png)
                    zip.closeEntry()
                }
            }
        }
        return FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", out)
    }

    // ---- document body ----

    private fun buildBody(b: DocBuilder, exam: Exam, studentMode: Boolean) {
        val layout = exam.templateLayout()
        if (exam.schoolHeader.isNotBlank()) b.body.append(para(textRun(exam.schoolHeader), align = "center"))
        b.body.append(para(textRun(exam.title.ifBlank { "Đề kiểm tra" }, bold = true), align = "center", sizeHalfPt = 32))
        val meta = buildList {
            if (exam.subject.isNotBlank()) add("Môn: ${exam.subject}")
            exam.durationMinutes?.let { add("Thời gian: $it phút") }
            add("${exam.numberedQuestions().size} câu")
        }
        if (meta.isNotEmpty()) b.body.append(para(textRun(meta.joinToString("    ")), align = "center", sizeHalfPt = 22))
        b.body.append(EMPTY_PARA)

        var counter = 0
        exam.blocks.forEachIndexed { blockIndex, block ->
            b.body.append(para(textRun(block.blockTitle, bold = true), sizeHalfPt = 26))
            if (layout?.sections?.size == exam.blocks.size) {
                layout.sections[blockIndex].stimulus?.let { b.body.append(para(textRun(it))) }
            }
            block.questions.forEach { q ->
                counter++
                b.body.append(para(textRun("Câu $counter. ", bold = true) + mathRuns(b, q.content)))
                layout?.slotFor(q, counter - 1)?.points?.takeIf { it.isNotBlank() }?.let {
                    b.body.append(para(textRun("    ($it điểm)"), sizeHalfPt = 19))
                }
                appendAnswerArea(b, q, studentMode, layout?.slotFor(q, counter - 1))
                if (!studentMode && !q.explanation.isNullOrBlank()) {
                    splitSentences(q.explanation).forEachIndexed { i, sentence ->
                        b.body.append(
                            para(
                                textRun(if (i == 0) "Lời giải: " else "    ", italic = true, color = AMBER) +
                                    mathRuns(b, sentence, italic = true, color = AMBER),
                                indent = 360
                            )
                        )
                    }
                }
                b.body.append(EMPTY_PARA)
            }
        }

        if (!studentMode) {
            val keyed = exam.numberedQuestions().filter { (_, q) -> !answerKey(q).isNullOrBlank() }
            if (keyed.isNotEmpty()) {
                b.body.append(para(textRun("BẢNG ĐÁP ÁN", bold = true), sizeHalfPt = 26))
                keyed.chunked(8).forEach { row ->
                    b.body.append(para(textRun(row.joinToString("    ") { (n, q) -> "$n. ${answerKey(q)}" })))
                }
            }
        }
    }

    private fun appendAnswerArea(b: DocBuilder, q: Question, studentMode: Boolean, slot: TemplateSlot?) {
        when (q.questionType) {
            QuestionType.MCQ -> q.options.forEach { opt ->
                val correct = !studentMode && opt.isCorrect
                val mark = if (correct) textRun("   ✓", bold = true, color = GREEN) else emptyList<Run>()
                b.body.append(
                    para(textRun("    ${opt.optionKey}. ", bold = correct) + mathRuns(b, opt.optionText, bold = correct) + mark)
                )
            }
            QuestionType.TRUE_FALSE -> {
                b.body.append(para(textRun("    ☐ Đúng        ☐ Sai")))
                if (!studentMode) b.body.append(para(textRun("    Đáp án: ${trueFalseLabel(q.correctAnswer)}", italic = true, color = GREEN)))
            }
            QuestionType.FILL_BLANK -> {
                b.body.append(para(textRun("    Trả lời: ......................................................")))
                if (!studentMode && !q.correctAnswer.isNullOrBlank()) {
                    b.body.append(para(textRun("    Đáp án: ", italic = true, color = GREEN) + mathRuns(b, q.correctAnswer, italic = true, color = GREEN)))
                }
            }
            QuestionType.ESSAY -> repeat((slot?.answerLines ?: q.draftLinesCount).coerceIn(0, 30)) {
                b.body.append(if (slot?.answerKind == "blank") EMPTY_PARA else para(textRun("    ................................................................................")))
            }
        }
    }

    private fun answerKey(q: Question): String? = when (q.questionType) {
        QuestionType.MCQ -> q.options.firstOrNull { it.isCorrect }?.optionKey ?: q.correctAnswer
        QuestionType.TRUE_FALSE -> trueFalseLabel(q.correctAnswer)
        QuestionType.FILL_BLANK -> q.correctAnswer?.let { MathConvert.toPlainText(it) }
        QuestionType.ESSAY -> null
    }

    private fun splitSentences(text: String): List<String> =
        text.split(Regex("(?<=\\.)\\s+(?=\\S)")).map { it.trim() }.filter { it.isNotEmpty() }

    // ---- runs: text (with super/subscript) + inline formula images ----

    private class DocBuilder {
        val body = StringBuilder()
        val images = ArrayList<ByteArray>()
        fun addImage(png: ByteArray): Int {
            images.add(png)
            return images.size // 1-based -> rIdImg{n} / image{n}.png
        }
    }

    private sealed interface Run
    private data class TextR(val text: String, val bold: Boolean, val italic: Boolean, val color: String?, val script: MathConvert.Script) : Run
    private data class ImageR(val index: Int, val widthPx: Int, val heightPx: Int) : Run

    private fun textRun(text: String, bold: Boolean = false, italic: Boolean = false, color: String? = null): List<Run> =
        listOf(TextR(text, bold, italic, color, MathConvert.Script.NONE))

    /** Parse math text into runs: prose -> vertAlign text runs, `$…$` -> embedded PNG. */
    private fun mathRuns(b: DocBuilder, text: String?, bold: Boolean = false, italic: Boolean = false, color: String? = null): List<Run> {
        val colorArgb = 0xFF000000.toInt() or (color?.toInt(16) ?: 0)
        return parseMathNodes(text).flatMap { node ->
            when (node) {
                is MathNode.Text -> MathConvert.segments(node.text).map { TextR(it.text, bold, italic, color, it.script) }
                is MathNode.Formula -> {
                    val bmp = LatexImage.bitmap(node.latex, FORMULA_TEXT_PX * FORMULA_SCALE, colorArgb)
                    if (bmp == null) {
                        MathConvert.segments("$" + node.latex + "$").map { TextR(it.text, bold, italic, color, it.script) }
                    } else {
                        val png = bmp.toPng()
                        val idx = b.addImage(png)
                        listOf(ImageR(idx, (bmp.width / FORMULA_SCALE).toInt().coerceAtLeast(1), (bmp.height / FORMULA_SCALE).toInt().coerceAtLeast(1)))
                    }
                }
            }
        }
    }

    private fun Bitmap.toPng(): ByteArray = ByteArrayOutputStream().use { out ->
        compress(Bitmap.CompressFormat.PNG, 100, out)
        out.toByteArray()
    }

    // ---- OOXML rendering ----

    private fun para(runs: List<Run>, align: String? = null, sizeHalfPt: Int? = null, indent: Int? = null): String {
        val pPr = StringBuilder("<w:pPr>")
        if (align != null) pPr.append("""<w:jc w:val="$align"/>""")
        if (indent != null) pPr.append("""<w:ind w:left="$indent"/>""")
        pPr.append("</w:pPr>")
        val body = runs.joinToString("") { renderRun(it, sizeHalfPt) }
        return "<w:p>$pPr$body</w:p>\n"
    }

    private fun renderRun(run: Run, sizeHalfPt: Int?): String = when (run) {
        is ImageR -> {
            val cx = run.widthPx * EMU_PER_PX
            val cy = run.heightPx * EMU_PER_PX
            val rId = "rIdImg${run.index}"
            val id = 1000 + run.index
            """<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">""" +
                """<wp:extent cx="$cx" cy="$cy"/><wp:docPr id="$id" name="Formula $id"/>""" +
                """<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">""" +
                """<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">""" +
                """<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">""" +
                """<pic:nvPicPr><pic:cNvPr id="$id" name="Formula $id"/><pic:cNvPicPr/></pic:nvPicPr>""" +
                """<pic:blipFill><a:blip r:embed="$rId"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>""" +
                """<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="$cx" cy="$cy"/></a:xfrm>""" +
                """<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>""" +
                """</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>"""
        }
        is TextR -> {
            val rPr = StringBuilder("<w:rPr>")
            if (run.bold) rPr.append("<w:b/>")
            if (run.italic) rPr.append("<w:i/>")
            if (run.color != null) rPr.append("""<w:color w:val="${run.color}"/>""")
            when (run.script) {
                MathConvert.Script.SUPER -> rPr.append("""<w:vertAlign w:val="superscript"/>""")
                MathConvert.Script.SUB -> rPr.append("""<w:vertAlign w:val="subscript"/>""")
                MathConvert.Script.NONE -> {}
            }
            if (sizeHalfPt != null) rPr.append("""<w:sz w:val="$sizeHalfPt"/><w:szCs w:val="$sizeHalfPt"/>""")
            rPr.append("</w:rPr>")
            """<w:r>$rPr<w:t xml:space="preserve">${xml(run.text)}</w:t></w:r>"""
        }
    }

    private const val EMPTY_PARA = "<w:p/>\n"

    private fun document(body: String, paper: TemplatePaper?): String {
        val width = (paper?.widthPt ?: 595) * 20
        val height = (paper?.heightPt ?: 842) * 20
        val top = ((paper?.topPt ?: 56.7f) * 20).toInt()
        val bottom = ((paper?.bottomPt ?: 56.7f) * 20).toInt()
        val left = ((paper?.leftPt ?: 56.7f) * 20).toInt()
        val right = ((paper?.rightPt ?: 56.7f) * 20).toInt()
        return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<w:body>
$body<w:sectPr><w:pgSz w:w="$width" w:h="$height"/><w:pgMar w:top="$top" w:right="$right" w:bottom="$bottom" w:left="$left" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>
</w:body>
</w:document>"""
    }

    private fun contentTypes(): String = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""

    private const val PACKAGE_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""

    private fun documentRels(imageCount: Int): String = buildString {
        append("""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>""")
        append("""<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">""")
        for (i in 1..imageCount) {
            append("""<Relationship Id="rIdImg$i" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image$i.png"/>""")
        }
        append("</Relationships>")
    }

    private fun xml(s: String): String = buildString {
        for (c in s) when (c) {
            '&' -> append("&amp;")
            '<' -> append("&lt;")
            '>' -> append("&gt;")
            '"' -> append("&quot;")
            else -> append(c)
        }
    }

    private fun ZipOutputStream.entry(name: String, content: String) {
        putNextEntry(ZipEntry(name))
        write(content.toByteArray(Charsets.UTF_8))
        closeEntry()
    }
}
