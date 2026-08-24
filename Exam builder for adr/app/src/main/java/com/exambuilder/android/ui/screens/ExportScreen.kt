package com.exambuilder.android.ui.screens

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.exambuilder.android.export.PdfExporter
import com.exambuilder.android.viewmodel.ExamViewModel

/**
 * Export trigger screen: renders the current exam to an A4 PDF
 * (see [PdfExporter]) and hands the result to the system share sheet so it
 * can be sent, opened, or saved via any installed app.
 */
@Composable
fun ExportScreen(viewModel: ExamViewModel) {
    val context = LocalContext.current
    var status by remember { mutableStateOf<String?>(null) }
    val exam = viewModel.exam

    Column(
        Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(Icons.Default.PictureAsPdf, contentDescription = null, modifier = Modifier.size(64.dp))
        Text("${exam.title.ifBlank { "Đề kiểm tra" }} — ${viewModel.questionCount()} câu hỏi", modifier = Modifier.padding(vertical = 16.dp))

        Button(
            enabled = viewModel.questionCount() > 0,
            onClick = {
                try {
                    val uri = PdfExporter.export(context, exam)
                    status = "Đã tạo PDF thành công."
                    val shareIntent = Intent(Intent.ACTION_SEND).apply {
                        type = "application/pdf"
                        putExtra(Intent.EXTRA_STREAM, uri)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    context.startActivity(Intent.createChooser(shareIntent, "Chia sẻ / Lưu PDF"))
                } catch (e: Exception) {
                    status = "Lỗi xuất PDF: ${e.message}"
                }
            }
        ) {
            Icon(Icons.Default.Share, contentDescription = null)
            Text(" Xuất & Chia sẻ PDF", modifier = Modifier.padding(start = 8.dp))
        }

        status?.let {
            Text(it, modifier = Modifier.padding(top = 12.dp), style = MaterialTheme.typography.bodyMedium)
        }
    }
}
