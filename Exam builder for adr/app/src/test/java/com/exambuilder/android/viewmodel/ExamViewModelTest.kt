package com.exambuilder.android.viewmodel

import com.exambuilder.android.model.Exam
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ExamViewModelTest {
    @Test
    fun `preview and export start in student mode`() {
        assertTrue(ExamViewModel().studentMode)
    }

    @Test
    fun `opening another exam hides answers after teacher mode was selected`() {
        val viewModel = ExamViewModel()
        viewModel.loadExam(Exam(title = "First"), "first")
        viewModel.setStudentView(false)
        assertFalse(viewModel.studentMode)
        viewModel.loadExam(Exam(title = "Second"), "second")
        assertTrue(viewModel.studentMode)
        assertEquals("second", viewModel.currentExamId)
    }

    @Test
    fun `reopening the same exam also hides answers without modifying the exam`() {
        val exam = Exam(title = "Original")
        val viewModel = ExamViewModel()
        viewModel.loadExam(exam, "exam")
        viewModel.setStudentView(false)
        viewModel.loadExam(exam, "exam")
        assertTrue(viewModel.studentMode)
        assertEquals(exam, viewModel.exam)
    }
}
