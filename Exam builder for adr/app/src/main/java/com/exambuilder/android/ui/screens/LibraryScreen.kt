package com.exambuilder.android.ui.screens

import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.exambuilder.android.data.dto.SavedExamDto
import com.exambuilder.android.viewmodel.LibraryViewModel
import com.exambuilder.android.BuildConfig
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val DATE_FMT: DateTimeFormatter =
    DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm").withZone(ZoneId.systemDefault())

private fun formatIso(iso: String?): String {
    if (iso.isNullOrBlank()) return "—"
    return runCatching { DATE_FMT.format(Instant.parse(iso)) }.getOrDefault(iso)
}

@Composable
private fun SyncStateRow(key: String, value: String, isSet: Boolean) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(
            key,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(96.dp)
        )
        Text(
            value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            color = if (isSet) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
fun LibraryScreen(
    libraryViewModel: LibraryViewModel,
    onOpenExam: (String) -> Unit,
    onExamDeleted: (String) -> Unit
) {
    val archive by libraryViewModel.archive.collectAsState()
    val settings by libraryViewModel.settings.collectAsState()
    val syncStatus by libraryViewModel.syncStatus.collectAsState()
    val syncing by libraryViewModel.syncing.collectAsState()

    // Token & Gist ID mac dinh "khoa" - chi hien nhan trang thai. Bam "Thay doi"
    // moi mo o nhap.
    var showTokenEditor by remember { mutableStateOf(false) }
    var showGistEditor by remember { mutableStateOf(false) }
    var tokenInput by remember { mutableStateOf("") }
    var gistInput by remember { mutableStateOf("") }

    var pendingDelete by remember { mutableStateOf<SavedExamDto?>(null) }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item {
            Text("Đề đã lưu", style = MaterialTheme.typography.titleLarge)
            Text(
                "Mọi đề bạn soạn đều được tự động lưu vào đây.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        if (archive.isEmpty()) {
            item {
                Text(
                    "Chưa có đề nào. Sang tab \"Soạn đề\" để bắt đầu.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        items(archive, key = { it.examId }) { ex ->
            Card(Modifier.fillMaxWidth()) {
                Row(
                    Modifier.fillMaxWidth().padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(ex.title.ifBlank { "Đề chưa đặt tên" }, fontWeight = FontWeight.Medium, maxLines = 2)
                        val sub = listOfNotNull(
                            ex.subject.ifBlank { null },
                            ex.durationMinutes?.let { "$it phút" },
                            "Sửa: ${formatIso(ex.updatedAt)}"
                        ).joinToString(" · ")
                        Text(sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    TextButton(onClick = { onOpenExam(ex.examId) }) { Text("Mở") }
                    IconButton(onClick = { pendingDelete = ex }) {
                        Icon(Icons.Default.Delete, contentDescription = "Xoá đề")
                    }
                }
            }
        }

        item { HorizontalDivider(Modifier.padding(vertical = 8.dp)) }

        item {
            Text("Đồng bộ (GitHub Gist)", style = MaterialTheme.typography.titleMedium)
            Text(
                if (settings.isSharedGist) "Bạn tự nhận kho đề chung, không cần token. Chỉ chủ kho " +
                    BuildConfig.SHARED_GIST_OWNER + " cần token để đẩy thay đổi lên."
                else "Kho riêng: kéo về không cần token; đẩy lên cần token của chủ Gist.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        item {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("Tự kéo kho đề khi mở ứng dụng", modifier = Modifier.weight(1f))
                Switch(checked = settings.autoPull, onCheckedChange = { libraryViewModel.setAutoPull(it) })
            }
        }

        item {
            SyncStateRow("Token GitHub", if (settings.hasToken) "✅ Đã lưu" else "⚠️ Chưa có", settings.hasToken)
            SyncStateRow(
                "Gist ID",
                if (settings.gistId.isNotBlank()) "✅ ${settings.gistId}" else "⚠️ Chưa có",
                settings.gistId.isNotBlank()
            )
        }

        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = { libraryViewModel.pull() },
                    enabled = !syncing,
                    modifier = Modifier.weight(1f)
                ) { Text("⬇️ Kéo về") }
                OutlinedButton(
                    onClick = { libraryViewModel.push() },
                    enabled = settings.hasToken && !syncing,
                    modifier = Modifier.weight(1f)
                ) { Text(if (settings.isSharedGist) "⬆️ Chủ kho đẩy lên" else "⬆️ Đẩy lên") }
            }
        }

        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = { showTokenEditor = !showTokenEditor; showGistEditor = false; tokenInput = "" },
                    modifier = Modifier.weight(1f)
                ) { Text("🔑 Thay đổi Token") }
                OutlinedButton(
                    onClick = { showGistEditor = !showGistEditor; showTokenEditor = false; gistInput = settings.gistId },
                    modifier = Modifier.weight(1f)
                ) { Text("🆔 Thay đổi Gist ID") }
            }
        }

        if (showTokenEditor) {
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = tokenInput,
                            onValueChange = { tokenInput = it },
                            label = { Text("Dán Token GitHub mới (quyền \"gist\")") },
                            singleLine = true,
                            visualTransformation = PasswordVisualTransformation(),
                            modifier = Modifier.fillMaxWidth()
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(
                                onClick = {
                                    if (tokenInput.isNotBlank()) {
                                        libraryViewModel.saveToken(tokenInput.trim())
                                        tokenInput = ""; showTokenEditor = false
                                    }
                                },
                                modifier = Modifier.weight(1f)
                            ) { Text("Lưu Token") }
                            OutlinedButton(
                                onClick = { showTokenEditor = false; tokenInput = "" },
                                modifier = Modifier.weight(1f)
                            ) { Text("Huỷ") }
                        }
                    }
                }
            }
        }

        if (showGistEditor) {
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(
                            onClick = {
                                libraryViewModel.saveGistId(BuildConfig.SHARED_GIST_ID)
                                showGistEditor = false
                            },
                            enabled = !syncing,
                            modifier = Modifier.fillMaxWidth()
                        ) { Text("Dùng kho đề chung mặc định") }
                        Text(
                            "Cách 1 — Tạo Gist mới (thiết bị đầu tiên; cần đã lưu Token):",
                            style = MaterialTheme.typography.bodySmall
                        )
                        OutlinedButton(
                            onClick = { libraryViewModel.createNewGist(); showGistEditor = false },
                            enabled = settings.hasToken && !syncing,
                            modifier = Modifier.fillMaxWidth()
                        ) { Text("🆕 Tạo Gist ID mới") }

                        Text(
                            "Cách 2 — Dán Gist ID đã có (copy từ thiết bị khác):",
                            style = MaterialTheme.typography.bodySmall
                        )
                        OutlinedTextField(
                            value = gistInput,
                            onValueChange = { gistInput = it },
                            label = { Text("Gist ID") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(
                                onClick = {
                                    if (gistInput.isNotBlank()) {
                                        libraryViewModel.saveGistId(gistInput.trim())
                                        showGistEditor = false
                                    }
                                },
                                modifier = Modifier.weight(1f)
                            ) { Text("Lưu Gist ID") }
                            OutlinedButton(
                                onClick = { showGistEditor = false },
                                modifier = Modifier.weight(1f)
                            ) { Text("Huỷ") }
                        }
                    }
                }
            }
        }

        item {
            syncStatus?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium)
            }
            Text(
                "Đồng bộ lần cuối: ${if (settings.lastSyncedAt.isBlank()) "chưa lần nào" else formatIso(settings.lastSyncedAt)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        item {
            Text(
                if (settings.isSharedGist) "Kho đề chung được chia sẻ cho mọi người, gồm cả đáp án. Giữ token của chủ kho trên thiết bị riêng."
                else "Gist không mã hóa: người có link có thể đọc đề và đáp án. Giữ token trên thiết bị riêng.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error
            )
        }
    }

    pendingDelete?.let { ex ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("Xóa đề?") },
            text = {
                Text(
                    "\"${ex.title.ifBlank { "Đề chưa đặt tên" }}\" chỉ bị xóa TRÊN MÁY NÀY.\n\n" +
                        "• Bấm \"⬆️ Đẩy lên\" sau đó để xóa vĩnh viễn trên cloud.\n" +
                        "• Nếu xóa nhầm (và chưa Đẩy lên), bấm \"⬇️ Kéo về\" để khôi phục."
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    libraryViewModel.delete(ex.examId) { onExamDeleted(ex.examId) }
                    pendingDelete = null
                }) { Text("Xóa") }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) { Text("Huỷ") }
            }
        )
    }
}
