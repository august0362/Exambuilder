package com.exambuilder.android.data.dto

import com.exambuilder.android.model.BlockType
import com.exambuilder.android.model.DifficultyLevel
import com.exambuilder.android.model.Exam
import com.exambuilder.android.model.Question
import com.exambuilder.android.model.QuestionBlock
import com.exambuilder.android.model.QuestionOption
import com.exambuilder.android.model.QuestionType
import com.exambuilder.android.math.MathPromote
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

/**
 * DTO cho file thu vien tren Gist (`exambuilder-library.json`). Tach hẳn khoi
 * domain model (model/Exam.kt) vi:
 *  - JSON dung snake_case ("question_type", "is_correct"...) khop voi parser
 *    cua web (backend parser) va bang SAVED_EXAM cua backend Node.
 *  - Co them cac truong dong bo (created_at / updated_at / deleted_at) khong
 *    thuoc ve de thi.
 * Merge logic o LibraryMerge.kt phai giong het backend/sync/library.js.
 */

const val LIBRARY_SCHEMA = "exambuilder/library@1"
const val LIBRARY_FILENAME = "exambuilder-library.json"

@OptIn(ExperimentalSerializationApi::class)
val LibraryJson: Json = Json {
    ignoreUnknownKeys = true
    encodeDefaults = true
    explicitNulls = true
    prettyPrint = true
    prettyPrintIndent = "  "
}

@Serializable
data class OptionDto(
    @SerialName("option_key") val optionKey: String = "",
    @SerialName("option_text") val optionText: String = "",
    @SerialName("is_correct") val isCorrect: Boolean = false
)

@Serializable
data class QuestionDto(
    @SerialName("question_type") val questionType: String = "ESSAY",
    val content: String = "",
    @SerialName("difficulty_level") val difficultyLevel: String? = null,
    @SerialName("correct_answer") val correctAnswer: String? = null,
    val explanation: String? = null,
    val options: List<OptionDto> = emptyList(),
    @SerialName("draft_lines_count") val draftLinesCount: Int = 0,
    @SerialName("template_slot_id") val templateSlotId: String? = null,
    val points: String? = null
)

@Serializable
data class BlockDto(
    @SerialName("block_type") val blockType: String = "MULTIPLE_CHOICE",
    @SerialName("block_title") val blockTitle: String? = null,
    val questions: List<QuestionDto> = emptyList()
)

@Serializable
data class SavedExamDto(
    @SerialName("exam_id") val examId: String,
    val title: String = "",
    val subject: String = "",
    @SerialName("duration_minutes") val durationMinutes: Int? = null,
    @SerialName("school_header") val schoolHeader: String = "",
    val blocks: List<BlockDto> = emptyList(),
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
    @SerialName("deleted_at") val deletedAt: String? = null,
    @SerialName("template_binding") val templateBinding: JsonObject? = null
) {
    val isDeleted: Boolean get() = deletedAt != null
}

/**
 * Chu de mau dong bo kem thu vien. Chi dong bo `id`; co chu van cuc bo tung
 * may. Luat hop nhat: "lan doi gan nhat thang" theo [updatedAt] (xem
 * LibraryMerge.pickNewerTheme) - KHAC luat "primary thang" cua de.
 */
@Serializable
data class ThemeDto(
    val id: String = "",
    @SerialName("updated_at") val updatedAt: String? = null
)

@Serializable
data class LibraryFile(
    val schema: String = LIBRARY_SCHEMA,
    @SerialName("updated_at") val updatedAt: String? = null,
    val theme: ThemeDto? = null,
    val exams: List<SavedExamDto> = emptyList()
)

// ---------- DTO -> domain ----------

fun SavedExamDto.toExam(): Exam = Exam(
    id = examId,
    title = title,
    subject = subject,
    durationMinutes = durationMinutes,
    schoolHeader = schoolHeader,
    blocks = blocks.map { it.toBlock() },
    templateBinding = templateBinding
)

private fun BlockDto.toBlock(): QuestionBlock = QuestionBlock(
    blockType = runCatching { BlockType.valueOf(blockType) }.getOrDefault(BlockType.MULTIPLE_CHOICE),
    blockTitle = blockTitle ?: if (blockType == "ESSAY") "Phần Tự luận" else "Phần Trắc nghiệm",
    questions = questions.map { it.toQuestion() }
)

private fun QuestionDto.toQuestion(): Question = Question(
    questionType = runCatching { QuestionType.valueOf(questionType) }.getOrDefault(QuestionType.ESSAY),
    // TASK E: de cu (dong bo tu Gist / nap tu file local) da bi ban cu lam
    // phang "√80", "1/2" -> quy lai ve $...$ LaTeX ngay khi nap. Idempotent
    // nen chay tren de moi cung vo hai; lan luu ke tiep ghi de ban nang cap.
    content = MathPromote.promote(content),
    // Web gui difficulty_level = null cho cau tu luan; domain model khong nhan
    // null nen mac dinh ve NB.
    difficultyLevel = difficultyLevel
        ?.let { runCatching { DifficultyLevel.valueOf(it) }.getOrNull() }
        ?: DifficultyLevel.NB,
    correctAnswer = correctAnswer?.let { MathPromote.promote(it) },
    explanation = explanation?.let { MathPromote.promote(it) },
    options = options.map {
        QuestionOption(optionKey = it.optionKey, optionText = MathPromote.promote(it.optionText), isCorrect = it.isCorrect)
    },
    draftLinesCount = draftLinesCount,
    templateSlotId = templateSlotId,
    points = points
)

// ---------- domain -> DTO ----------

fun Exam.toSavedExamDto(examId: String, createdAt: String?, nowIso: String): SavedExamDto = SavedExamDto(
    examId = examId,
    title = title,
    subject = subject,
    durationMinutes = durationMinutes,
    schoolHeader = schoolHeader,
    blocks = blocks.map { it.toDto() },
    createdAt = createdAt ?: nowIso,
    updatedAt = nowIso,
    deletedAt = null,
    templateBinding = templateBinding
)

private fun QuestionBlock.toDto(): BlockDto = BlockDto(
    blockType = blockType.name,
    blockTitle = blockTitle,
    questions = questions.map { it.toDto() }
)

private fun Question.toDto(): QuestionDto = QuestionDto(
    questionType = questionType.name,
    content = content,
    difficultyLevel = difficultyLevel.name,
    correctAnswer = correctAnswer,
    explanation = explanation,
    options = options.map { OptionDto(optionKey = it.optionKey, optionText = it.optionText, isCorrect = it.isCorrect) },
    draftLinesCount = draftLinesCount,
    templateSlotId = templateSlotId,
    points = points
)
