package com.exambuilder.android.viewmodel

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import com.exambuilder.android.model.BlockType
import com.exambuilder.android.model.DifficultyLevel
import com.exambuilder.android.model.Exam
import com.exambuilder.android.model.Question
import com.exambuilder.android.model.QuestionBlock
import com.exambuilder.android.model.QuestionOption
import com.exambuilder.android.model.QuestionType

/**
 * Single source of truth for the exam currently being built, shared by the
 * builder / preview / export screens via [com.exambuilder.android.ui.navigation.ExamBuilderNavHost].
 * Kept intentionally simple (in-memory, no persistence) - mirrors the web
 * app's `state.blocks` (frontend/script.js) for the current editing session.
 */
class ExamViewModel : ViewModel() {

    var exam by mutableStateOf(Exam(title = "Đề kiểm tra"))
        private set

    /**
     * exam_id trong kho de (exam-library.json) cho de dang soan. null = de moi
     * chua tung luu -> lan luu dau tao ban ghi moi. Xem [com.exambuilder.android.viewmodel.LibraryViewModel].
     */
    var currentExamId by mutableStateOf<String?>(null)

    fun updateMeta(
        title: String = exam.title,
        subject: String = exam.subject,
        durationMinutes: Int? = exam.durationMinutes,
        schoolHeader: String = exam.schoolHeader,
    ) {
        exam = exam.copy(title = title, subject = subject, durationMinutes = durationMinutes, schoolHeader = schoolHeader)
    }

    /** Nap 1 de tu kho de vao trinh soan (thay toan bo state hien tai). */
    fun loadExam(loaded: Exam, archiveId: String?) {
        exam = loaded
        currentExamId = archiveId
    }

    fun addQuestion(blockType: BlockType, question: Question) {
        val blockTitle = if (blockType == BlockType.MULTIPLE_CHOICE) "Phần I. Trắc nghiệm" else "Phần II. Tự luận"
        val existing = exam.blocks.find { it.blockType == blockType }
        val updatedBlocks = if (existing != null) {
            exam.blocks.map { if (it.id == existing.id) it.copy(questions = it.questions + question) else it }
        } else {
            exam.blocks + QuestionBlock(blockType = blockType, blockTitle = blockTitle, questions = listOf(question))
        }
        exam = exam.copy(blocks = updatedBlocks)
    }

    /**
     * Save an edited question. When [original] is null this is a fresh add.
     * If the question's type moved it across the trắc-nghiệm / tự-luận divide
     * the question is relocated to the correct block (appended); otherwise it
     * is replaced in place so its position is preserved.
     */
    fun upsertQuestion(original: Question?, updated: Question) {
        if (original == null) {
            addQuestion(blockFor(updated.questionType), updated)
            return
        }
        val currentBlock = exam.blocks.firstOrNull { b -> b.questions.any { it.id == original.id } }
        val target = blockFor(updated.questionType)
        if (currentBlock != null && currentBlock.blockType == target) {
            exam = exam.copy(
                blocks = exam.blocks.map { b ->
                    if (b.id != currentBlock.id) b
                    else b.copy(questions = b.questions.map { if (it.id == updated.id) updated else it })
                }
            )
        } else {
            removeQuestion(original.id)
            addQuestion(target, updated)
        }
    }

    fun removeQuestion(questionId: String) {
        exam = exam.copy(
            blocks = exam.blocks
                .map { it.copy(questions = it.questions.filterNot { q -> q.id == questionId }) }
                .filter { it.questions.isNotEmpty() }
        )
    }

    /** Reorder a question within its block (no-op at the ends). */
    fun moveQuestion(questionId: String, up: Boolean) {
        exam = exam.copy(
            blocks = exam.blocks.map { b ->
                val idx = b.questions.indexOfFirst { it.id == questionId }
                if (idx < 0) return@map b
                val target = if (up) idx - 1 else idx + 1
                if (target !in b.questions.indices) return@map b
                val list = b.questions.toMutableList()
                list.add(target, list.removeAt(idx))
                b.copy(questions = list)
            }
        )
    }

    fun allQuestions(): List<Question> = exam.blocks.flatMap { it.questions }

    fun questionCount(): Int = allQuestions().size

    companion object {
        private fun blockFor(type: QuestionType): BlockType =
            if (type == QuestionType.ESSAY) BlockType.ESSAY else BlockType.MULTIPLE_CHOICE

        /** A ready-to-edit blank question of the given type. */
        fun blank(type: QuestionType): Question = when (type) {
            QuestionType.MCQ -> Question(
                questionType = QuestionType.MCQ,
                content = "",
                difficultyLevel = DifficultyLevel.NB,
                correctAnswer = "A",
                options = listOf("A", "B", "C", "D").mapIndexed { i, key ->
                    QuestionOption(optionKey = key, optionText = "", isCorrect = i == 0)
                }
            )
            QuestionType.TRUE_FALSE -> Question(
                questionType = QuestionType.TRUE_FALSE,
                content = "",
                difficultyLevel = DifficultyLevel.NB,
                correctAnswer = "Dung"
            )
            QuestionType.FILL_BLANK -> Question(
                questionType = QuestionType.FILL_BLANK,
                content = "",
                difficultyLevel = DifficultyLevel.TH,
                correctAnswer = ""
            )
            QuestionType.ESSAY -> Question(
                questionType = QuestionType.ESSAY,
                content = "",
                difficultyLevel = DifficultyLevel.VD,
                draftLinesCount = 5
            )
        }
    }
}
