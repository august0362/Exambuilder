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

    fun updateMeta(title: String = exam.title, subject: String = exam.subject, durationMinutes: Int? = exam.durationMinutes) {
        exam = exam.copy(title = title, subject = subject, durationMinutes = durationMinutes)
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

    fun removeQuestion(questionId: String) {
        exam = exam.copy(
            blocks = exam.blocks
                .map { it.copy(questions = it.questions.filterNot { q -> q.id == questionId }) }
                .filter { it.questions.isNotEmpty() }
        )
    }

    fun allQuestions(): List<Question> = exam.blocks.flatMap { it.questions }

    fun questionCount(): Int = allQuestions().size

    companion object {
        fun blankMcq(): Question = Question(
            questionType = QuestionType.MCQ,
            content = "",
            difficultyLevel = DifficultyLevel.NB,
            correctAnswer = "A",
            options = listOf(
                QuestionOption(optionKey = "A", optionText = "", isCorrect = true),
                QuestionOption(optionKey = "B", optionText = "", isCorrect = false),
                QuestionOption(optionKey = "C", optionText = "", isCorrect = false),
                QuestionOption(optionKey = "D", optionText = "", isCorrect = false)
            )
        )
    }
}
