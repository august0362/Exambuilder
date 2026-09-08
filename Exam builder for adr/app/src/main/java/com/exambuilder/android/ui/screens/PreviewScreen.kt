package com.exambuilder.android.ui.screens

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.IosShare
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.exambuilder.android.export.DOCX_MIME
import com.exambuilder.android.export.DocxExporter
import com.exambuilder.android.export.PDF_MIME
import com.exambuilder.android.export.PdfExporter
import com.exambuilder.android.export.shareExportedFile
import com.exambuilder.android.export.trueFalseLabel
import com.exambuilder.android.math.MathText
import com.exambuilder.android.model.Question
import com.exambuilder.android.model.QuestionType
import com.exambuilder.android.viewmodel.ExamViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Read-only render of the exam. Questions are numbered continuously 1..N
 * across the whole paper (matches the web). Tap a card to reveal answers and
 * the worked solution. The app-bar toggles a student view and exports the
 * paper to PDF or Word.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PreviewScreen(viewModel: ExamViewModel) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val exam = viewModel.exam

    var studentMode by rememberSaveable { mutableStateOf(false) }
    var expanded by remember { mutableStateOf(setOf<String>()) }
    var exportMenuOpen by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    val snackbar = remember { SnackbarHostState() }

    // Number once (not inside the item lambda - that re-runs on every recompose).
    val numbered = remember(exam) {
        var n = 0
        exam.blocks.map { block -> block to block.questions.map { q -> ++n to q } }
    }
    val total = remember(exam) { exam.blocks.sumOf { it.questions.size } }

    fun runExport(kind: ExportKind) {
        if (busy) return
        busy = true
        exportMenuOpen = false
        scope.launch {
            val result = runCatching {
                withContext(Dispatchers.IO) {
                    when (kind) {
                        ExportKind.PDF -> PdfExporter.export(context, exam, studentMode) to PDF_MIME
                        ExportKind.DOCX -> DocxExporter.export(context, exam, studentMode) to DOCX_MIME
                    }
                }
            }
            busy = false
            val out = result.getOrNull()
            if (out != null) {
                shareExportedFile(context, out.first, out.second)
            } else {
                snackbar.showSnackbar("Lỗi khi xuất tệp: ${result.exceptionOrNull()?.message ?: "không rõ"}")
            }
        }
    }

    Scaffold(
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = { Text("Xem trước đề") },
                actions = {
                    IconButton(onClick = { studentMode = !studentMode }) {
                        Icon(
                            if (studentMode) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                            contentDescription = if (studentMode) "Đang ẩn đáp án" else "Đang hiện đáp án"
                        )
                    }
                    Box {
                        IconButton(onClick = { exportMenuOpen = true }, enabled = total > 0 && !busy) {
                            Icon(Icons.Default.IosShare, contentDescription = "Xuất đề")
                        }
                        DropdownMenu(expanded = exportMenuOpen, onDismissRequest = { exportMenuOpen = false }) {
                            DropdownMenuItem(
                                text = { Text("Xuất PDF") },
                                leadingIcon = { Icon(Icons.Default.PictureAsPdf, contentDescription = null) },
                                onClick = { runExport(ExportKind.PDF) }
                            )
                            DropdownMenuItem(
                                text = { Text("Xuất Word (.docx)") },
                                leadingIcon = { Icon(Icons.Default.Description, contentDescription = null) },
                                onClick = { runExport(ExportKind.DOCX) }
                            )
                        }
                    }
                }
            )
        }
    ) { padding ->
        if (total == 0) {
            Box(Modifier.fillMaxSize().padding(padding).padding(32.dp), contentAlignment = Alignment.Center) {
                Text(
                    "Chưa có câu hỏi nào. Sang tab \"Soạn đề\" để thêm.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            return@Scaffold
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 40.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item(key = "exam_header") { ExamHeaderCard(exam.title, exam.subject, exam.durationMinutes, exam.schoolHeader, total, studentMode) }

            numbered.forEach { (block, questions) ->
                item(key = "hdr_${block.id}") {
                    Text(
                        "${block.blockTitle}  ·  ${questions.size} câu",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(top = 8.dp, bottom = 2.dp)
                    )
                }
                items(questions, key = { it.second.id }) { (number, question) ->
                    QuestionCard(
                        number = number,
                        question = question,
                        studentMode = studentMode,
                        expanded = question.id in expanded,
                        onToggle = {
                            expanded = if (question.id in expanded) expanded - question.id else expanded + question.id
                        }
                    )
                }
            }
        }
    }
}

private enum class ExportKind { PDF, DOCX }

@Composable
private fun ExamHeaderCard(
    title: String,
    subject: String,
    durationMinutes: Int?,
    schoolHeader: String,
    total: Int,
    studentMode: Boolean,
) {
    Card(
        Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (schoolHeader.isNotBlank()) {
                Text(
                    schoolHeader,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Text(
                title.ifBlank { "Đề kiểm tra" },
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )
            val meta = buildList {
                if (subject.isNotBlank()) add("Môn: $subject")
                durationMinutes?.let { add("Thời gian: $it phút") }
                add("$total câu")
                add(if (studentMode) "Bản học sinh" else "Bản giáo viên")
            }
            Text(
                meta.joinToString("   ·   "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun QuestionCard(
    number: Int,
    question: Question,
    studentMode: Boolean,
    expanded: Boolean,
    onToggle: () -> Unit,
) {
    val hasSecrets = !studentMode &&
        (!question.explanation.isNullOrBlank() || answerLine(question) != null || question.questionType == QuestionType.MCQ)

    Card(
        onClick = onToggle,
        modifier = Modifier.fillMaxWidth().animateContentSize(),
        colors = CardDefaults.cardColors(),
        border = if (expanded) BorderStroke(1.dp, MaterialTheme.colorScheme.primary) else null
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                NumberBadge(number)
                Spacer(Modifier.weight(1f))
                AssistChip(onClick = {}, label = { Text(question.difficultyLevel.label) })
            }

            MathText(
                text = question.content.ifBlank { "(Chưa có nội dung)" },
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium,
                maxLines = if (expanded) Int.MAX_VALUE else 6,
                overflow = TextOverflow.Ellipsis
            )

            when (question.questionType) {
                QuestionType.MCQ -> Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    question.options.forEach { opt ->
                        OptionRow(
                            key = opt.optionKey,
                            text = opt.optionText,
                            highlight = !studentMode && opt.isCorrect
                        )
                    }
                }
                QuestionType.ESSAY -> if (question.draftLinesCount > 0) {
                    Text(
                        "Trả lời:  (${question.draftLinesCount} dòng)",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                QuestionType.TRUE_FALSE -> Text(
                    "☐ Đúng      ☐ Sai",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                QuestionType.FILL_BLANK -> Text(
                    "Trả lời:  ______________",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            if (expanded && !studentMode) {
                answerLine(question)?.let { answer ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Icon(
                            Icons.Default.CheckCircle,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(18.dp)
                        )
                        MathText(
                            "Đáp án: $answer",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
                if (!question.explanation.isNullOrBlank()) {
                    ExplanationBlock(question.explanation)
                }
            }

            if (hasSecrets && !studentMode) {
                Text(
                    if (expanded) "Chạm để thu gọn" else "Chạm để xem đáp án & lời giải",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun NumberBadge(number: Int) {
    Box(
        Modifier
            .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(8.dp))
            .padding(horizontal = 10.dp, vertical = 4.dp)
    ) {
        Text(
            "Câu $number",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onPrimary
        )
    }
}

@Composable
private fun OptionRow(key: String, text: String, highlight: Boolean) {
    val container = if (highlight) MaterialTheme.colorScheme.primaryContainer else Color.Transparent
    val onContainer = if (highlight) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface
    Row(
        Modifier
            .fillMaxWidth()
            .background(container, RoundedCornerShape(8.dp))
            .padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Box(
            Modifier
                .size(24.dp)
                .border(1.dp, onContainer.copy(alpha = 0.4f), RoundedCornerShape(6.dp)),
            contentAlignment = Alignment.Center
        ) {
            Text(key, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = onContainer)
        }
        MathText(
            text.ifBlank { "…" },
            style = MaterialTheme.typography.bodyMedium,
            color = onContainer,
            modifier = Modifier.weight(1f)
        )
        if (highlight) {
            Icon(
                Icons.Default.CheckCircle,
                contentDescription = "Đáp án đúng",
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(18.dp)
            )
        }
    }
}

@Composable
private fun ExplanationBlock(explanation: String) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(10.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp)
    ) {
        Text(
            "Lời giải",
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.secondary
        )
        splitSentences(explanation).forEach { sentence ->
            MathText(
                sentence,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

/** The answer to show for a question, or null when there is nothing to reveal. */
private fun answerLine(question: Question): String? = when (question.questionType) {
    QuestionType.TRUE_FALSE -> question.correctAnswer?.let { trueFalseLabel(it) }
    QuestionType.FILL_BLANK -> question.correctAnswer?.takeIf { it.isNotBlank() }
    QuestionType.MCQ -> question.options.firstOrNull { it.isCorrect }?.let { "${it.optionKey}. ${it.optionText}" }
        ?: question.correctAnswer?.takeIf { it.isNotBlank() }
    QuestionType.ESSAY -> null
}

/** One sentence (". " terminated) per line — matches the web preview. */
private fun splitSentences(text: String): List<String> =
    text.split(Regex("(?<=\\.)\\s+(?=\\S)")).map { it.trim() }.filter { it.isNotEmpty() }
