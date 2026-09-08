package com.exambuilder.android.export

import android.content.Context
import android.content.Intent
import android.net.Uri
import com.exambuilder.android.model.Exam
import com.exambuilder.android.model.QuestionType

/** MIME type for a Word .docx file. */
const val DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
const val PDF_MIME = "application/pdf"

/** File-system-safe stem for an exported document, derived from the exam title. */
fun Exam.exportFileStem(): String =
    title.ifBlank { "de-kiem-tra" }
        .trim()
        .replace(Regex("""[\\/:*?"<>|]+"""), "")
        .replace(Regex("""\s+"""), "_")
        .take(80)
        .ifBlank { "de-kiem-tra" }

/** Continuous 1..N numbering across every block, matching the web preview. */
fun Exam.numberedQuestions(): List<Pair<Int, com.exambuilder.android.model.Question>> {
    var n = 0
    return blocks.flatMap { block -> block.questions.map { q -> ++n to q } }
}

/** True/False and Fill-blank answers are stored with the web's ASCII keys. */
fun trueFalseLabel(answer: String?): String = if (answer == "Sai") "Sai" else "Đúng"

fun QuestionType.vietnameseLabel(): String = when (this) {
    QuestionType.MCQ -> "Trắc nghiệm"
    QuestionType.TRUE_FALSE -> "Đúng / Sai"
    QuestionType.FILL_BLANK -> "Điền khuyết"
    QuestionType.ESSAY -> "Tự luận"
}

/** Hand [uri] to the system share sheet (send / open / save to Drive, etc.). */
fun shareExportedFile(context: Context, uri: Uri, mime: String) {
    val send = Intent(Intent.ACTION_SEND).apply {
        type = mime
        putExtra(Intent.EXTRA_STREAM, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    context.startActivity(Intent.createChooser(send, "Chia sẻ / Lưu tệp"))
}
