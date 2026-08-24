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
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
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
import androidx.compose.ui.unit.dp
import com.exambuilder.android.model.BlockType
import com.exambuilder.android.model.DifficultyLevel
import com.exambuilder.android.model.Question
import com.exambuilder.android.viewmodel.ExamViewModel

/**
 * Primary authoring screen: exam metadata + question list. Switches from a
 * single scrolling column (phone) to a two-pane list/detail layout once the
 * available width crosses the ~600dp tablet breakpoint, so the same screen
 * works across phone/tablet densities down to API 26.
 */
@Composable
fun ExamBuilderScreen(viewModel: ExamViewModel) {
    var showAddDialog by remember { mutableStateOf(false) }
    var selectedQuestion by remember { mutableStateOf<Question?>(null) }

    Scaffold(
        floatingActionButton = {
            ExtendedFloatingActionButton(onClick = { showAddDialog = true }) {
                Icon(Icons.Default.Add, contentDescription = null)
                Text(" Thêm câu hỏi", modifier = Modifier.padding(start = 4.dp))
            }
        }
    ) { padding ->
        BoxWithConstraints(Modifier.fillMaxSize().padding(padding)) {
            val isWide = maxWidth > 600.dp
            if (isWide) {
                Row(Modifier.fillMaxSize()) {
                    Column(Modifier.width(320.dp)) {
                        QuestionListPane(viewModel, onSelect = { selectedQuestion = it })
                    }
                    Box(Modifier.fillMaxSize().padding(16.dp)) {
                        selectedQuestion?.let { QuestionDetailCard(it) }
                            ?: Text("Chọn 1 câu hỏi để xem chi tiết", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            } else {
                QuestionListPane(viewModel, onSelect = { selectedQuestion = it }, header = true)
            }
        }
    }

    if (showAddDialog) {
        AddQuestionDialog(
            onDismiss = { showAddDialog = false },
            onConfirm = { blockType, question ->
                viewModel.addQuestion(blockType, question)
                showAddDialog = false
            }
        )
    }
}

@Composable
private fun QuestionListPane(viewModel: ExamViewModel, onSelect: (Question) -> Unit, header: Boolean = false) {
    val exam = viewModel.exam
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        if (header) {
            item {
                Column {
                    OutlinedTextField(
                        value = exam.title,
                        onValueChange = { viewModel.updateMeta(title = it) },
                        label = { Text("Tên đề thi") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Text(
                        "${viewModel.questionCount()} câu hỏi",
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                }
            }
        }
        exam.blocks.forEach { block ->
            item { Text(block.blockTitle, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)) }
            items(block.questions, key = { it.id }) { q ->
                QuestionRow(q, onClick = { onSelect(q) }, onDelete = { viewModel.removeQuestion(q.id) })
            }
        }
        if (exam.blocks.isEmpty()) {
            item { Text("Chưa có câu hỏi nào. Bấm \"Thêm câu hỏi\" để bắt đầu.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
}

@Composable
private fun QuestionRow(question: Question, onClick: () -> Unit, onDelete: () -> Unit) {
    Card(onClick = onClick, colors = CardDefaults.cardColors()) {
        Row(
            Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    question.content.ifBlank { "(Chưa có nội dung)" },
                    maxLines = 2,
                    fontWeight = FontWeight.Medium
                )
                AssistChip(onClick = {}, label = { Text(question.difficultyLevel.label) })
            }
            IconButton(onClick = onDelete) {
                Icon(Icons.Default.Delete, contentDescription = "Xoá câu hỏi")
            }
        }
    }
}

@Composable
private fun QuestionDetailCard(question: Question) {
    Card(border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.padding(16.dp)) {
            Text(question.content, style = MaterialTheme.typography.bodyLarge)
            question.options.forEach { opt ->
                Text("${opt.optionKey}. ${opt.optionText}" + if (opt.isCorrect) "  ✓" else "")
            }
        }
    }
}

@Composable
private fun AddQuestionDialog(onDismiss: () -> Unit, onConfirm: (BlockType, Question) -> Unit) {
    var content by remember { mutableStateOf("") }
    var difficulty by remember { mutableStateOf(DifficultyLevel.NB) }

    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Thêm câu hỏi trắc nghiệm") },
        text = {
            Column {
                OutlinedTextField(
                    value = content,
                    onValueChange = { content = it },
                    label = { Text("Nội dung câu hỏi") },
                    modifier = Modifier.fillMaxWidth()
                )
                Text("Mức độ", style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    DifficultyLevel.entries.forEach { level ->
                        FilterChip(
                            selected = difficulty == level,
                            onClick = { difficulty = level },
                            label = { Text(level.label) }
                        )
                    }
                }
            }
        },
        confirmButton = {
            androidx.compose.material3.TextButton(onClick = {
                val base = ExamViewModel.blankMcq()
                onConfirm(BlockType.MULTIPLE_CHOICE, base.copy(content = content, difficultyLevel = difficulty))
            }) { Text("Thêm") }
        },
        dismissButton = {
            androidx.compose.material3.TextButton(onClick = onDismiss) { Text("Huỷ") }
        }
    )
}
