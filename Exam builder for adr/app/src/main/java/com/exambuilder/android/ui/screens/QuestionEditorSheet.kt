package com.exambuilder.android.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.exambuilder.android.export.vietnameseLabel
import com.exambuilder.android.math.MathConvert
import com.exambuilder.android.model.DifficultyLevel
import com.exambuilder.android.model.Question
import com.exambuilder.android.model.QuestionOption
import com.exambuilder.android.model.QuestionType
import java.util.UUID

/**
 * Full add / edit surface for a single question (content, type, difficulty,
 * options + correct key, true-false / fill answer, essay lines, explanation).
 * Presented as a [ModalBottomSheet] so it works the same on phone and tablet.
 *
 * [initial] == null  -> add mode. Otherwise the question is edited in place
 * (its `id` is preserved). Text is normalised with [MathConvert.normalizeInput]
 * on save so it stays interchangeable with the web client.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun QuestionEditorSheet(
    initial: Question?,
    onDismiss: () -> Unit,
    onSave: (Question) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val editing = initial != null

    var type by remember { mutableStateOf(initial?.questionType ?: QuestionType.MCQ) }
    var difficulty by remember { mutableStateOf(initial?.difficultyLevel ?: DifficultyLevel.NB) }
    var content by remember { mutableStateOf(initial?.content ?: "") }
    var explanation by remember { mutableStateOf(initial?.explanation ?: "") }
    var options by remember {
        mutableStateOf(
            initial?.options?.takeIf { it.isNotEmpty() }
                ?: listOf("A", "B", "C", "D").mapIndexed { i, k ->
                    QuestionOption(optionKey = k, optionText = "", isCorrect = i == 0)
                }
        )
    }
    var tfAnswer by remember {
        val fromInitial = initial != null && initial.questionType == QuestionType.TRUE_FALSE && initial.correctAnswer == "Sai"
        mutableStateOf(if (fromInitial) "Sai" else "Dung")
    }
    var fillAnswer by remember {
        val fromInitial = if (initial != null && initial.questionType == QuestionType.FILL_BLANK) initial.correctAnswer.orEmpty() else ""
        mutableStateOf(fromInitial)
    }
    var essayLines by remember { mutableStateOf(initial?.draftLinesCount?.takeIf { it > 0 } ?: 5) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 28.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Text(
                if (editing) "Sửa câu hỏi" else "Thêm câu hỏi",
                style = MaterialTheme.typography.titleLarge
            )

            LabeledGroup("Loại câu hỏi") {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    QuestionType.entries.forEach { t ->
                        FilterChip(
                            selected = type == t,
                            onClick = { type = t },
                            label = { Text(t.vietnameseLabel()) }
                        )
                    }
                }
            }

            LabeledGroup("Mức độ") {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    DifficultyLevel.entries.forEach { level ->
                        FilterChip(
                            selected = difficulty == level,
                            onClick = { difficulty = level },
                            label = { Text(level.label) }
                        )
                    }
                }
            }

            OutlinedTextField(
                value = content,
                onValueChange = { content = it },
                label = { Text("Nội dung câu hỏi") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2
            )
            Text(
                "Công thức: đặt trong \$...\$ cho LaTeX (\$\\frac{a}{b}\$, \$\\sqrt{x}\$) hoặc gõ thường: x^2, sqrt(16), a/b, >=, <=>",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            when (type) {
                QuestionType.MCQ -> OptionsEditor(options = options, onChange = { options = it })
                QuestionType.TRUE_FALSE -> LabeledGroup("Đáp án đúng") {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(selected = tfAnswer == "Dung", onClick = { tfAnswer = "Dung" }, label = { Text("Đúng") })
                        FilterChip(selected = tfAnswer == "Sai", onClick = { tfAnswer = "Sai" }, label = { Text("Sai") })
                    }
                }
                QuestionType.FILL_BLANK -> OutlinedTextField(
                    value = fillAnswer,
                    onValueChange = { fillAnswer = it },
                    label = { Text("Đáp án") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                QuestionType.ESSAY -> LabeledGroup("Số dòng kẻ chừa cho học sinh") {
                    Stepper(value = essayLines, onChange = { essayLines = it }, range = 0..30)
                }
            }

            OutlinedTextField(
                value = explanation,
                onValueChange = { explanation = it },
                label = { Text("Lời giải / giải thích (không bắt buộc)") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2
            )

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = onDismiss, modifier = Modifier.weight(1f)) { Text("Huỷ") }
                Button(
                    onClick = {
                        onSave(
                            buildQuestion(
                                base = initial,
                                type = type,
                                difficulty = difficulty,
                                content = content,
                                explanation = explanation,
                                options = options,
                                tfAnswer = tfAnswer,
                                fillAnswer = fillAnswer,
                                essayLines = essayLines
                            )
                        )
                    },
                    enabled = content.isNotBlank(),
                    modifier = Modifier.weight(1f)
                ) { Text(if (editing) "Lưu" else "Thêm") }
            }
        }
    }
}

@Composable
private fun LabeledGroup(label: String, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        content()
    }
}

@Composable
private fun OptionsEditor(options: List<QuestionOption>, onChange: (List<QuestionOption>) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "Các lựa chọn — chọn nút tròn ở đáp án đúng",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        options.forEachIndexed { i, opt ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                RadioButton(
                    selected = opt.isCorrect,
                    onClick = { onChange(options.mapIndexed { j, o -> o.copy(isCorrect = j == i) }) }
                )
                OutlinedTextField(
                    value = opt.optionText,
                    onValueChange = { v -> onChange(options.mapIndexed { j, o -> if (j == i) o.copy(optionText = v) else o }) },
                    label = { Text("Lựa chọn ${('A' + i)}") },
                    modifier = Modifier.weight(1f),
                    singleLine = true
                )
                IconButton(
                    onClick = {
                        val next = options.filterIndexed { j, _ -> j != i }
                            .mapIndexed { j, o -> o.copy(optionKey = ('A' + j).toString()) }
                        onChange(if (next.none { it.isCorrect }) next.mapIndexed { j, o -> o.copy(isCorrect = j == 0) } else next)
                    },
                    enabled = options.size > 2
                ) { Icon(Icons.Default.Close, contentDescription = "Xoá lựa chọn") }
            }
        }
        TextButton(
            onClick = {
                onChange(options + QuestionOption(optionKey = ('A' + options.size).toString(), optionText = "", isCorrect = false))
            },
            enabled = options.size < 6
        ) {
            Icon(Icons.Default.Add, contentDescription = null)
            Text("Thêm lựa chọn", modifier = Modifier.padding(start = 4.dp))
        }
    }
}

@Composable
private fun Stepper(value: Int, onChange: (Int) -> Unit, range: IntRange) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        FilledTonalIconButton(
            onClick = { onChange((value - 1).coerceIn(range.first, range.last)) },
            enabled = value > range.first
        ) { Icon(Icons.Default.Remove, contentDescription = "Bớt một dòng") }
        Text("$value dòng", style = MaterialTheme.typography.titleMedium)
        FilledTonalIconButton(
            onClick = { onChange((value + 1).coerceIn(range.first, range.last)) },
            enabled = value < range.last
        ) { Icon(Icons.Default.Add, contentDescription = "Thêm một dòng") }
    }
}

private fun buildQuestion(
    base: Question?,
    type: QuestionType,
    difficulty: DifficultyLevel,
    content: String,
    explanation: String,
    options: List<QuestionOption>,
    tfAnswer: String,
    fillAnswer: String,
    essayLines: Int,
): Question {
    val id = base?.id ?: UUID.randomUUID().toString()
    val normContent = MathConvert.normalizeInput(content)
    val normExplanation = MathConvert.normalizeInput(explanation).ifBlank { null }

    return (when (type) {
        QuestionType.MCQ -> {
            val relabeled = options.mapIndexed { i, o ->
                o.copy(optionKey = ('A' + i).toString(), optionText = MathConvert.normalizeInput(o.optionText))
            }
            val correctKey = relabeled.firstOrNull { it.isCorrect }?.optionKey
                ?: relabeled.firstOrNull()?.optionKey
            Question(
                id = id, questionType = type, content = normContent, difficultyLevel = difficulty,
                correctAnswer = correctKey, explanation = normExplanation, options = relabeled
            )
        }
        QuestionType.TRUE_FALSE -> Question(
            id = id, questionType = type, content = normContent, difficultyLevel = difficulty,
            correctAnswer = if (tfAnswer == "Sai") "Sai" else "Dung", explanation = normExplanation
        )
        QuestionType.FILL_BLANK -> Question(
            id = id, questionType = type, content = normContent, difficultyLevel = difficulty,
            correctAnswer = MathConvert.normalizeInput(fillAnswer).ifBlank { null }, explanation = normExplanation
        )
        QuestionType.ESSAY -> Question(
            id = id, questionType = type, content = normContent, difficultyLevel = difficulty,
            explanation = normExplanation, draftLinesCount = essayLines.coerceIn(0, 30)
        )
    }).copy(templateSlotId = base?.templateSlotId, points = base?.points)
}
