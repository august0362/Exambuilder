package com.exambuilder.android.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.exambuilder.android.model.Question
import com.exambuilder.android.model.QuestionType
import com.exambuilder.android.viewmodel.ExamViewModel

/**
 * Read-only render of the exam as it would print, with a "Chế độ Học sinh"
 * (student mode) toggle that hides correct answers / explanations - mirrors
 * frontend/script.js's isStudentMode behavior.
 */
@Composable
fun PreviewScreen(viewModel: ExamViewModel) {
    var studentMode by remember { mutableStateOf(false) }
    val exam = viewModel.exam

    Column(Modifier.fillMaxWidth().padding(16.dp)) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Chế độ Học sinh", style = MaterialTheme.typography.bodyMedium)
            Switch(checked = studentMode, onCheckedChange = { studentMode = it })
        }
        HorizontalDivider(Modifier.padding(vertical = 8.dp))

        LazyColumn(contentPadding = PaddingValues(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                Text(exam.title, style = MaterialTheme.typography.titleLarge)
                if (exam.subject.isNotBlank()) Text(exam.subject, style = MaterialTheme.typography.bodyMedium)
            }
            var counter = 0
            exam.blocks.forEach { block ->
                item { Text(block.blockTitle, style = MaterialTheme.typography.titleMedium) }
                items(block.questions, key = { it.id }) { q ->
                    counter++
                    PreviewQuestionCard(index = counter, question = q, studentMode = studentMode)
                }
            }
        }
    }
}

@Composable
private fun PreviewQuestionCard(index: Int, question: Question, studentMode: Boolean) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Text("Câu $index. ${question.content}", fontWeight = FontWeight.Medium)
            if (question.questionType == QuestionType.MCQ) {
                question.options.forEach { opt ->
                    val mark = if (!studentMode && opt.isCorrect) " ✓" else ""
                    Text("   ${opt.optionKey}. ${opt.optionText}$mark")
                }
            }
            if (!studentMode && !question.explanation.isNullOrBlank()) {
                Text(
                    "Lời giải: ${question.explanation}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.secondary
                )
            }
        }
    }
}
