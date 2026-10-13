package com.exambuilder.android.model

import java.util.UUID
import kotlinx.serialization.json.JsonObject

/**
 * Mirrors the exam JSON schema produced by the web app's parsers
 * (backend/parser/TextPromptParser.js, FileUploadParser.js) so exams
 * exported from either client stay interchangeable.
 */
enum class QuestionType { MCQ, TRUE_FALSE, FILL_BLANK, ESSAY }

enum class DifficultyLevel(val label: String) {
    NB("Nhận biết"),
    TH("Thông hiểu"),
    VD("Vận dụng"),
    VDC("Vận dụng cao")
}

enum class BlockType { MULTIPLE_CHOICE, ESSAY }

data class QuestionOption(
    val id: String = UUID.randomUUID().toString(),
    val optionKey: String,
    val optionText: String,
    val isCorrect: Boolean
)

data class Question(
    val id: String = UUID.randomUUID().toString(),
    val questionType: QuestionType,
    val content: String,
    val difficultyLevel: DifficultyLevel,
    val correctAnswer: String? = null,
    val explanation: String? = null,
    val options: List<QuestionOption> = emptyList(),
    val draftLinesCount: Int = 0,
    val templateSlotId: String? = null,
    val points: String? = null
)

data class QuestionBlock(
    val id: String = UUID.randomUUID().toString(),
    val blockType: BlockType,
    val blockTitle: String,
    val questions: List<Question> = emptyList()
)

data class Exam(
    val id: String = UUID.randomUUID().toString(),
    val title: String = "",
    val subject: String = "",
    val durationMinutes: Int? = null,
    val schoolHeader: String = "",
    val blocks: List<QuestionBlock> = emptyList(),
    // Opaque render-critical snapshot from the web; preserve when opening and
    // saving even when this Android release cannot edit every layout property.
    val templateBinding: JsonObject? = null
)
