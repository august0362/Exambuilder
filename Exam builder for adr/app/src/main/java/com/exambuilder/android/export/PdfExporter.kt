package com.exambuilder.android.export

import android.content.Context
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.net.Uri
import androidx.core.content.FileProvider
import com.exambuilder.android.math.LatexImage
import com.exambuilder.android.math.MathConvert
import com.exambuilder.android.math.MathNode
import com.exambuilder.android.math.parseMathNodes
import com.exambuilder.android.model.Exam
import com.exambuilder.android.model.Question
import com.exambuilder.android.model.QuestionType
import com.exambuilder.android.model.templateLayout
import java.io.File
import java.io.FileOutputStream

// A4 at 72 pt/inch.
private const val PAGE_W = 595
private const val PAGE_H = 842
private const val MARGIN = 54f
private const val LINE = 17f

// JLaTeXMath is rasterised at this multiple of the target text size for a
// crisper result once the PDF is zoomed / printed.
private const val FORMULA_SCALE = 2.5f

private fun paint(sizePt: Float, bold: Boolean = false, color: Int = Color.BLACK) = Paint().apply {
    isAntiAlias = true
    textSize = sizePt
    this.color = color
    if (bold) typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
}

private val TITLE = paint(17f, bold = true)
private val SUBTITLE = paint(11f, color = 0xFF475569.toInt())
private val HEADING = paint(13f, bold = true, color = 0xFF1E293B.toInt())
private val BODY = paint(11.5f)
private val BODY_BOLD = paint(11.5f, bold = true)
private val ANSWER = paint(11f, color = 0xFF15803D.toInt())
private val EXPLAIN = paint(10.5f, color = 0xFF92400E.toInt())
private val MUTED = paint(9.5f, color = 0xFF94A3B8.toInt())

/**
 * Renders an [Exam] to a clean multi-page A4 PDF using the platform
 * [PdfDocument] API (no third-party PDF dependency). Formulas (`$…$`,
 * `\begin{cases}`, …) are rendered with JLaTeXMath and drawn as images; the
 * rest of the text flows around them.
 *
 *  - [studentMode] `true`  -> exam paper only (no answers, no explanations).
 *  - [studentMode] `false` -> teacher copy: inline answers, explanations and
 *    a compact answer key at the end.
 */
object PdfExporter {

    fun export(context: Context, exam: Exam, studentMode: Boolean = false): Uri {
        val doc = PdfDocument()
        val layout = exam.templateLayout()
        val w = PageWriter(doc, layout?.paper)

        if (exam.schoolHeader.isNotBlank()) w.centered(exam.schoolHeader, SUBTITLE)
        w.centered(exam.title.ifBlank { "Đề kiểm tra" }, TITLE)
        val meta = buildList {
            if (exam.subject.isNotBlank()) add("Môn: ${exam.subject}")
            exam.durationMinutes?.let { add("Thời gian: $it phút") }
            add("${exam.numberedQuestions().size} câu")
        }
        if (meta.isNotEmpty()) w.centered(meta.joinToString("    "), SUBTITLE)
        w.gap(0.6f)
        w.rule()
        w.gap(0.4f)

        var counter = 0
        exam.blocks.forEachIndexed { blockIndex, block ->
            w.ensure(LINE * 3)
            w.line(block.blockTitle, HEADING)
            if (layout?.sections?.size == exam.blocks.size) {
                layout.sections[blockIndex].stimulus?.let { w.line(it, BODY) }
            }
            w.gap(0.2f)

            block.questions.forEach { q ->
                counter++
                w.ensure(LINE * 3)
                w.flow("Câu $counter. ", BODY_BOLD, q.content, BODY)
                layout?.slotFor(q, counter - 1)?.points?.takeIf { it.isNotBlank() }?.let { w.line("     ($it điểm)", MUTED) }

                when (q.questionType) {
                    QuestionType.MCQ -> q.options.forEach { opt ->
                        val correct = !studentMode && opt.isCorrect
                        w.flow(
                            "     ${opt.optionKey}. ",
                            if (correct) BODY_BOLD else BODY,
                            opt.optionText + if (correct) "   ✓" else "",
                            if (correct) BODY_BOLD else BODY,
                        )
                    }
                    QuestionType.TRUE_FALSE -> {
                        w.line("     ☐ Đúng        ☐ Sai", BODY)
                        if (!studentMode) w.line("     Đáp án: ${trueFalseLabel(q.correctAnswer)}", ANSWER)
                    }
                    QuestionType.FILL_BLANK -> {
                        w.line("     Trả lời: ..................................................", BODY)
                        if (!studentMode && !q.correctAnswer.isNullOrBlank()) {
                            w.flow("     Đáp án: ", ANSWER, q.correctAnswer, ANSWER)
                        }
                    }
                    QuestionType.ESSAY -> {
                        val slot = layout?.slotFor(q, counter - 1)
                        w.answerSpace(slot?.answerKind ?: "lined", slot?.answerLines ?: q.draftLinesCount.coerceIn(0, 30))
                    }
                }

                if (!studentMode && !q.explanation.isNullOrBlank()) {
                    splitSentences(q.explanation).forEachIndexed { i, sentence ->
                        w.flow(if (i == 0) "     Lời giải: " else "        ", EXPLAIN, sentence, EXPLAIN)
                    }
                }
                w.gap(0.4f)
            }
        }

        if (!studentMode) {
            val keyed = exam.numberedQuestions().filter { (_, q) -> !answerText(q).isNullOrBlank() }
            if (keyed.isNotEmpty()) {
                w.ensure(LINE * 4)
                w.gap(0.4f)
                w.rule()
                w.line("BẢNG ĐÁP ÁN", HEADING)
                keyed.chunked(8).forEach { row ->
                    w.line(row.joinToString("    ") { (n, q) -> "$n. ${answerText(q)}" }, BODY)
                }
            }
        }

        return w.finish(context, exam.exportFileStem() + ".pdf")
    }

    private fun answerText(q: Question): String? = when (q.questionType) {
        QuestionType.MCQ -> q.options.firstOrNull { it.isCorrect }?.optionKey ?: q.correctAnswer
        QuestionType.TRUE_FALSE -> trueFalseLabel(q.correctAnswer)
        QuestionType.FILL_BLANK -> q.correctAnswer?.let { MathConvert.toPlainText(it) }
        QuestionType.ESSAY -> null
    }

    /** One sentence (". " terminated) per line — matches the on-screen preview. */
    private fun splitSentences(text: String): List<String> =
        text.split(Regex("(?<=\\.)\\s+(?=\\S)")).map { it.trim() }.filter { it.isNotEmpty() }
}

/**
 * Cursor over a growing [PdfDocument]; wraps text to the content width and
 * starts a new page when the current one is full.
 */
private class PageWriter(private val doc: PdfDocument, paper: com.exambuilder.android.model.TemplatePaper?) {
    private val width = paper?.widthPt ?: PAGE_W
    private val height = paper?.heightPt ?: PAGE_H
    private val top = paper?.topPt ?: MARGIN
    private val bottom = paper?.bottomPt ?: MARGIN
    private val left = paper?.leftPt ?: MARGIN
    private val right = width - (paper?.rightPt ?: MARGIN)
    private val contentW = right - left
    private var page = newPage()
    private var canvas = page.canvas
    private var y = top
    private var pageNo = 1

    private fun newPage(): PdfDocument.Page =
        doc.startPage(PdfDocument.PageInfo.Builder(width, height, doc.pages.size + 1).create())

    fun ensure(extra: Float) {
        if (y + extra <= height - bottom) return
        stampFooter()
        doc.finishPage(page)
        page = newPage()
        canvas = page.canvas
        y = top
        pageNo++
    }

    private fun stampFooter() {
        canvas.drawText("Trang $pageNo", width / 2f - 18f, height - bottom + 12f, MUTED)
    }

    fun gap(lines: Float) {
        y += LINE * lines
    }

    fun rule() {
        ensure(LINE)
        canvas.drawLine(left, y - LINE * 0.4f, right, y - LINE * 0.4f, MUTED)
        y += LINE * 0.4f
    }

    fun centered(text: String, p: Paint) {
        wrap(text, p, contentW).forEach {
            ensure(LINE)
            canvas.drawText(it, (width - p.measureText(it)) / 2f, y, p)
            y += LINE
        }
    }

    fun line(text: String, p: Paint) {
        wrap(text, p, contentW).forEach {
            ensure(LINE)
            canvas.drawText(it, left, y, p)
            y += LINE
        }
    }

    fun answerSpace(kind: String, lines: Int) {
        repeat(lines.coerceIn(0, 30)) {
            ensure(LINE)
            when (kind) {
                "blank", "none" -> Unit
                "drawing" -> {
                    canvas.drawLine(left, y - LINE * 0.7f, right, y - LINE * 0.7f, MUTED)
                    canvas.drawLine(left, y - LINE * 0.7f, left, y + LINE * 0.3f, MUTED)
                    canvas.drawLine(right, y - LINE * 0.7f, right, y + LINE * 0.3f, MUTED)
                }
                "squared", "table" -> {
                    canvas.drawLine(left, y + LINE * 0.3f, right, y + LINE * 0.3f, MUTED)
                    var x = left
                    while (x <= right) { canvas.drawLine(x, y - LINE * 0.7f, x, y + LINE * 0.3f, MUTED); x += LINE }
                }
                else -> canvas.drawLine(left, y + LINE * 0.3f, right, y + LINE * 0.3f, MUTED)
            }
            y += LINE
        }
    }

    /**
     * Draw [prefix] (in [prefixPaint]) then [text] (in [bodyPaint]) — parsing
     * `$…$` / `\begin{…}` into JLaTeXMath images and flowing the plain runs
     * as words, wrapping to the content width. Continuation lines indent to
     * the prefix width.
     */
    fun flow(prefix: String, prefixPaint: Paint, text: String?, bodyPaint: Paint) {
        ensure(LINE)
        val indent = prefixPaint.measureText(prefix)
        canvas.drawText(prefix, left, y, prefixPaint)
        var x = left + indent
        var lineExtra = 0f

        fun newline() {
            y += LINE + lineExtra
            lineExtra = 0f
            ensure(LINE)
            x = left + indent
        }

        fun drawWords(s: String) {
            for (word in tokenize(s)) {
                val wWidth = bodyPaint.measureText(word)
                if (x + wWidth > right && x > left + indent) newline()
                canvas.drawText(word, x, y, bodyPaint)
                x += wWidth
            }
        }

        parseMathNodes(text).forEach { node ->
            when (node) {
                is MathNode.Text -> drawWords(MathConvert.toPlainText(node.text))
                is MathNode.Formula -> {
                    val bmp = LatexImage.bitmap(node.latex, bodyPaint.textSize * FORMULA_SCALE, bodyPaint.color)
                    if (bmp == null) {
                        drawWords(MathConvert.toPlainText("$" + node.latex + "$"))
                    } else {
                        val tw = bmp.width / FORMULA_SCALE
                        val th = bmp.height / FORMULA_SCALE
                        if (x + tw > right && x > left + indent) newline()
                        val top = y - th * 0.72f
                        canvas.drawBitmap(bmp, null, RectF(x, top, x + tw, top + th), null)
                        x += tw + 2f
                        lineExtra = maxOf(lineExtra, th - LINE)
                    }
                }
            }
        }
        y += LINE + lineExtra
    }

    fun finish(context: Context, fileName: String): Uri {
        stampFooter()
        doc.finishPage(page)
        val out = File(context.getExternalFilesDir("exports"), fileName)
        out.parentFile?.mkdirs()
        FileOutputStream(out).use { doc.writeTo(it) }
        doc.close()
        return FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", out)
    }

    /** Split keeping trailing spaces so word widths add up on a line. */
    private fun tokenize(s: String): List<String> {
        if (s.isEmpty()) return emptyList()
        val out = ArrayList<String>()
        val sb = StringBuilder()
        for (ch in s) {
            sb.append(ch)
            if (ch == ' ') {
                out.add(sb.toString()); sb.setLength(0)
            }
        }
        if (sb.isNotEmpty()) out.add(sb.toString())
        return out
    }

    private fun wrap(text: String, p: Paint, maxWidth: Float): List<String> {
        val out = ArrayList<String>()
        text.split("\n").forEach { paragraph ->
            var current = StringBuilder()
            for (word in paragraph.split(" ")) {
                val candidate = if (current.isEmpty()) word else "$current $word"
                if (p.measureText(candidate) > maxWidth && current.isNotEmpty()) {
                    out.add(current.toString())
                    current = StringBuilder(word)
                } else {
                    current = StringBuilder(candidate)
                }
            }
            out.add(current.toString())
        }
        return out
    }
}
