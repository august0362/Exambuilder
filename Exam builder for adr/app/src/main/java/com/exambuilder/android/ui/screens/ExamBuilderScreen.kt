package com.exambuilder.android.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardOptions
import com.exambuilder.android.export.vietnameseLabel
import com.exambuilder.android.math.MathText
import com.exambuilder.android.model.Question
import com.exambuilder.android.viewmodel.ExamViewModel

/**
 * Primary authoring screen: exam metadata + question list. Switches from a
 * single scrolling column (phone) to a two-pane list/detail layout once the
 * available width crosses the ~600dp tablet breakpoint. Adding or tapping a
 * question opens the full [QuestionEditorSheet].
 */
@Composable
fun ExamBuilderScreen(viewModel: ExamViewModel) {
    // null editorTarget  -> sheet closed.  editorTarget.question == null -> add.
    var editorTarget by remember { mutableStateOf<EditorTarget?>(null) }
    var selectedForDetail by remember { mutableStateOf<Question?>(null) }

    Scaffold(
        floatingActionButton = {
            ExtendedFloatingActionButton(onClick = { editorTarget = EditorTarget(null) }) {
                Icon(Icons.Default.Add, contentDescription = null)
                Text(" Thêm câu hỏi", modifier = Modifier.padding(start = 4.dp))
            }
        }
    ) { padding ->
        BoxWithConstraints(Modifier.fillMaxSize().padding(padding)) {
            val isWide = maxWidth > 600.dp
            if (isWide) {
                Row(Modifier.fillMaxSize()) {
                    Column(Modifier.width(340.dp)) {
                        QuestionListPane(
                            viewModel = viewModel,
                            header = true,
                            onOpen = { selectedForDetail = it },
                            onEdit = { editorTarget = EditorTarget(it) }
                        )
                    }
                    Box(Modifier.fillMaxSize().padding(16.dp)) {
                        selectedForDetail?.let { q ->
                            QuestionDetailCard(q, onEdit = { editorTarget = EditorTarget(q) })
                        } ?: Text(
                            "Chọn 1 câu hỏi để xem chi tiết",
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            } else {
                QuestionListPane(
                    viewModel = viewModel,
                    header = true,
                    onOpen = { editorTarget = EditorTarget(it) },
                    onEdit = { editorTarget = EditorTarget(it) }
                )
            }
        }
    }

    editorTarget?.let { target ->
        QuestionEditorSheet(
            initial = target.question,
            onDismiss = { editorTarget = null },
            onSave = { updated ->
                viewModel.upsertQuestion(target.question, updated)
                selectedForDetail = updated
                editorTarget = null
            }
        )
    }
}

private data class EditorTarget(val question: Question?)

@Composable
private fun QuestionListPane(
    viewModel: ExamViewModel,
    header: Boolean,
    onOpen: (Question) -> Unit,
    onEdit: (Question) -> Unit,
) {
    val exam = viewModel.exam
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        if (header) {
            item { ExamMetaEditor(viewModel) }
        }
        exam.blocks.forEach { block ->
            item(key = "hdr_${block.id}") {
                Text(
                    block.blockTitle,
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
            items(block.questions, key = { it.id }) { q ->
                QuestionRow(
                    question = q,
                    onOpen = { onOpen(q) },
                    onEdit = { onEdit(q) },
                    onDelete = { viewModel.removeQuestion(q.id) },
                    onMoveUp = { viewModel.moveQuestion(q.id, up = true) },
                    onMoveDown = { viewModel.moveQuestion(q.id, up = false) }
                )
            }
        }
        if (exam.blocks.isEmpty()) {
            item {
                Text(
                    "Chưa có câu hỏi nào. Bấm \"Thêm câu hỏi\" để bắt đầu.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun ExamMetaEditor(viewModel: ExamViewModel) {
    val exam = viewModel.exam
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(
            value = exam.title,
            onValueChange = { viewModel.updateMeta(title = it) },
            label = { Text("Tên đề thi") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = exam.subject,
                onValueChange = { viewModel.updateMeta(subject = it) },
                label = { Text("Môn") },
                singleLine = true,
                modifier = Modifier.weight(1f)
            )
            OutlinedTextField(
                value = exam.durationMinutes?.toString() ?: "",
                onValueChange = { v -> viewModel.updateMeta(durationMinutes = v.filter { it.isDigit() }.toIntOrNull()) },
                label = { Text("Phút") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.width(96.dp)
            )
        }
        OutlinedTextField(
            value = exam.schoolHeader,
            onValueChange = { viewModel.updateMeta(schoolHeader = it) },
            label = { Text("Tiêu đề trường / sở (in ở đầu đề)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Text(
            "${viewModel.questionCount()} câu hỏi",
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(top = 2.dp)
        )
    }
}

@Composable
private fun QuestionRow(
    question: Question,
    onOpen: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onMoveUp: () -> Unit,
    onMoveDown: () -> Unit,
) {
    Card(onClick = onOpen, colors = CardDefaults.cardColors()) {
        Column(Modifier.fillMaxWidth().padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                MathText(
                    question.content.ifBlank { "(Chưa có nội dung)" },
                    maxLines = 2,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.weight(1f)
                )
                IconButton(onClick = onEdit) { Icon(Icons.Default.Edit, contentDescription = "Sửa câu hỏi") }
                IconButton(onClick = onDelete) { Icon(Icons.Default.Delete, contentDescription = "Xoá câu hỏi") }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                AssistChip(onClick = {}, label = { Text(question.difficultyLevel.label) })
                AssistChip(onClick = {}, label = { Text(question.questionType.vietnameseLabel()) })
                IconButton(onClick = onMoveUp) { Icon(Icons.Default.ArrowUpward, contentDescription = "Lên") }
                IconButton(onClick = onMoveDown) { Icon(Icons.Default.ArrowDownward, contentDescription = "Xuống") }
            }
        }
    }
}

@Composable
private fun QuestionDetailCard(question: Question, onEdit: () -> Unit) {
    Card(border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    question.questionType.vietnameseLabel() + " · " + question.difficultyLevel.label,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f)
                )
                Button(onClick = onEdit) {
                    Icon(Icons.Default.Edit, contentDescription = null)
                    Text(" Sửa", modifier = Modifier.padding(start = 4.dp))
                }
            }
            MathText(question.content.ifBlank { "(Chưa có nội dung)" }, style = MaterialTheme.typography.bodyLarge)
            question.options.forEach { opt ->
                MathText(
                    "${opt.optionKey}. ${opt.optionText}" + if (opt.isCorrect) "  ✓" else "",
                    color = if (opt.isCorrect) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                )
            }
            if (!question.correctAnswer.isNullOrBlank() && question.options.isEmpty()) {
                MathText("Đáp án: ${question.correctAnswer}", color = MaterialTheme.colorScheme.primary)
            }
            if (!question.explanation.isNullOrBlank()) {
                MathText(
                    "Lời giải: ${question.explanation}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}
