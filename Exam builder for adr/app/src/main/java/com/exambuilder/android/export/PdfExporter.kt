package com.exambuilder.android.export

import android.content.Context
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.net.Uri
import androidx.core.content.FileProvider
import com.exambuilder.android.model.Exam
import com.exambuilder.android.model.QuestionType
import java.io.File
import java.io.FileOutputStream

/**
 * Renders an [Exam] to a multi-page A4 PDF using the platform PdfDocument
 * API (no third-party PDF library needed). Mirrors the pagination logic of
 * the web app's print stylesheet (frontend/style.css @media print) but
 * draws text directly since there is no HTML layout engine here.
 */
object PdfExporter {

    // A4 at 72pt/inch: 210mm x 297mm ~= 595 x 842 points.
    private const val PAGE_WIDTH = 595
    private const val PAGE_HEIGHT = 842
    private const val MARGIN = 56f
    private const val LINE_HEIGHT = 18f

    fun export(context: Context, exam: Exam): Uri {
        val document = PdfDocument()
        val titlePaint = Paint().apply { textSize = 16f; isFakeBoldText = true }
        val bodyPaint = Paint().apply { textSize = 12f }
        val mutedPaint = Paint().apply { textSize = 11f; color = 0xFF64748B.toInt() }

        var page = document.startPage(PdfDocument.PageInfo.Builder(PAGE_WIDTH, PAGE_HEIGHT, document.pages.size + 1).create())
        var canvas = page.canvas
        var y = MARGIN

        fun newPageIfNeeded(extra: Float = LINE_HEIGHT) {
            if (y + extra > PAGE_HEIGHT - MARGIN) {
                document.finishPage(page)
                page = document.startPage(PdfDocument.PageInfo.Builder(PAGE_WIDTH, PAGE_HEIGHT, document.pages.size + 1).create())
                canvas = page.canvas
                y = MARGIN
            }
        }

        canvas.drawText(exam.title.ifBlank { "Đề kiểm tra" }, MARGIN, y, titlePaint)
        y += LINE_HEIGHT * 1.5f
        if (exam.subject.isNotBlank()) {
            canvas.drawText(exam.subject, MARGIN, y, mutedPaint)
            y += LINE_HEIGHT
        }
        y += LINE_HEIGHT * 0.5f

        var counter = 0
        exam.blocks.forEach { block ->
            newPageIfNeeded()
            canvas.drawText(block.blockTitle, MARGIN, y, titlePaint)
            y += LINE_HEIGHT * 1.3f

            block.questions.forEach { q ->
                counter++
                newPageIfNeeded()
                wrapText("Câu $counter. ${q.content}", bodyPaint, PAGE_WIDTH - 2 * MARGIN).forEach { line ->
                    newPageIfNeeded()
                    canvas.drawText(line, MARGIN, y, bodyPaint)
                    y += LINE_HEIGHT
                }
                if (q.questionType == QuestionType.MCQ) {
                    q.options.forEach { opt ->
                        newPageIfNeeded()
                        val mark = if (opt.isCorrect) " (Đáp án đúng)" else ""
                        canvas.drawText("   ${opt.optionKey}. ${opt.optionText}$mark", MARGIN, y, bodyPaint)
                        y += LINE_HEIGHT
                    }
                }
                y += LINE_HEIGHT * 0.5f
            }
        }
        document.finishPage(page)

        val outFile = File(context.getExternalFilesDir("exports"), "${exam.title.ifBlank { "de-kiem-tra" }.replace(Regex("\\s+"), "_")}.pdf")
        outFile.parentFile?.mkdirs()
        FileOutputStream(outFile).use { document.writeTo(it) }
        document.close()

        return FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", outFile)
    }

    /** Naive word-wrap - no HTML/CSS engine here, so wrapping is measured manually. */
    private fun wrapText(text: String, paint: Paint, maxWidth: Float): List<String> {
        val words = text.split(" ")
        val lines = mutableListOf<String>()
        var current = StringBuilder()
        words.forEach { word ->
            val candidate = if (current.isEmpty()) word else "${current} $word"
            if (paint.measureText(candidate) > maxWidth && current.isNotEmpty()) {
                lines.add(current.toString())
                current = StringBuilder(word)
            } else {
                current = StringBuilder(candidate)
            }
        }
        if (current.isNotEmpty()) lines.add(current.toString())
        return lines
    }
}
