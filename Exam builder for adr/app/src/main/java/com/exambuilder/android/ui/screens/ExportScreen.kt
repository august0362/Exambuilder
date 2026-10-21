package com.exambuilder.android.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.exambuilder.android.export.DOCX_MIME
import com.exambuilder.android.export.DocxExporter
import com.exambuilder.android.export.PDF_MIME
import com.exambuilder.android.export.PdfExporter
import com.exambuilder.android.export.shareExportedFile
import com.exambuilder.android.viewmodel.ExamViewModel
import com.exambuilder.android.model.templateLayout
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Export centre: renders the current exam to a print-ready A4 PDF
 * ([PdfExporter]) or a Word .docx ([DocxExporter]) and hands the result to
 * the system share sheet. A student-mode switch strips answers and solutions.
 */
@Composable
fun ExportScreen(viewModel: ExamViewModel) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val exam = viewModel.exam
    val questionCount = viewModel.questionCount()

    val studentMode = viewModel.studentMode
    var busy by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf<String?>(null) }

    fun export(pdf: Boolean) {
        if (busy) return
        busy = true
        status = null
        scope.launch {
            val outcome = runCatching {
                withContext(Dispatchers.IO) {
                    if (pdf) PdfExporter.export(context, exam, studentMode) to PDF_MIME
                    else DocxExporter.export(context, exam, studentMode) to DOCX_MIME
                }
            }
            busy = false
            outcome
                .onSuccess { (uri, mime) ->
                    status = "Đã tạo tệp. Chọn nơi lưu / chia sẻ."
                    shareExportedFile(context, uri, mime)
                }
                .onFailure { status = "Lỗi khi xuất: ${it.message ?: "không rõ"}" }
        }
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("Xuất đề", style = MaterialTheme.typography.titleLarge)
        Text(
            "${exam.title.ifBlank { "Đề kiểm tra" }} — $questionCount câu",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        if (exam.templateBinding != null) {
            Text(
                if (exam.templateLayout() == null) "Cấu trúc câu khác snapshot template; Android xuất nội dung với bố cục cơ bản. Snapshot vẫn được giữ khi lưu/đồng bộ."
                else "Android áp dụng khổ giấy, lề, điểm và vùng trả lời từ template khi xuất; nền và bố cục nhiều cột chưa được áp dụng.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        Card(Modifier.fillMaxWidth()) {
            Row(
                Modifier.fillMaxWidth().padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column(Modifier.weight(1f)) {
                    Text("Chế độ học sinh", fontWeight = FontWeight.Medium)
                    Text(
                        "Ẩn đáp án, lời giải và bảng đáp án.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Switch(checked = studentMode, onCheckedChange = viewModel::setStudentView)
            }
        }

        Button(
            onClick = { export(pdf = true) },
            enabled = questionCount > 0 && !busy,
            modifier = Modifier.fillMaxWidth()
        ) {
            Icon(Icons.Default.PictureAsPdf, contentDescription = null)
            Text("  Xuất PDF")
        }
        OutlinedButton(
            onClick = { export(pdf = false) },
            enabled = questionCount > 0 && !busy,
            modifier = Modifier.fillMaxWidth()
        ) {
            Icon(Icons.Default.Description, contentDescription = null)
            Text("  Xuất Word (.docx)")
        }

        if (busy) CircularProgressIndicator()
        status?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
    }
}
