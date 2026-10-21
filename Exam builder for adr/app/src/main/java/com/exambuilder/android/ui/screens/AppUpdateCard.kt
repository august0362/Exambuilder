package com.exambuilder.android.ui.screens

import android.content.Context
import android.content.Intent
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.core.net.toUri
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.exambuilder.android.BuildConfig
import com.exambuilder.android.viewmodel.AppUpdateViewModel
import java.io.File

@Composable
fun AppUpdateCard(viewModel: AppUpdateViewModel) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    fun install() {
        val file = state.readyApk ?: return
        runCatching { openApkInstaller(context, file) }
            .onFailure { viewModel.installationFailed(it.message ?: "Không mở được trình cài đặt Android.") }
    }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        if (context.packageManager.canRequestPackageInstalls()) install()
        else viewModel.report("Chưa được phép cài cập nhật. Bấm Cài đặt để cấp quyền và thử lại.")
    }

    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Cập nhật ứng dụng", style = MaterialTheme.typography.titleMedium)
            Text("Phiên bản hiện tại: ${BuildConfig.VERSION_NAME}")
            Text("Nguồn: GitHub · ${BuildConfig.UPDATE_REPOSITORY}", style = MaterialTheme.typography.bodySmall)
            if (!state.online) {
                Text("Đang ngoại tuyến. Tự kiểm tra khi có kết nối Internet.", style = MaterialTheme.typography.bodyMedium)
            }
            state.release?.let { release ->
                Text("Có phiên bản mới: ${release.manifest.versionName}", color = MaterialTheme.colorScheme.primary)
                if (release.notes.isNotBlank()) Text(release.notes.take(2000), style = MaterialTheme.typography.bodySmall)
                when {
                    state.downloading -> {
                        LinearProgressIndicator(progress = { state.progress }, modifier = Modifier.fillMaxWidth())
                        Text("Đang tải: ${(state.progress * 100).toInt()}%")
                    }
                    state.readyApk != null -> {
                        Button(onClick = {
                            if (context.packageManager.canRequestPackageInstalls()) install()
                            else runCatching {
                                permissionLauncher.launch(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                    "package:${context.packageName}".toUri()))
                            }.onFailure { viewModel.report("Không mở được phần cấp quyền cài đặt. Hãy kiểm tra Cài đặt Android.") }
                        }) { Text("Cài đặt bản mới") }
                        Text("Android sẽ yêu cầu bạn xác nhận cài đặt.", style = MaterialTheme.typography.bodySmall)
                    }
                    else -> Button(onClick = viewModel::download, enabled = state.online && !state.checking) {
                        Text("Cập nhật · ${"%.1f".format(release.apk.size / 1048576.0)} MB")
                    }
                }
            }
            state.message?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
            OutlinedButton(
                onClick = { viewModel.checkForUpdates(manual = true) },
                enabled = !state.checking && !state.downloading
            ) { Text(if (state.checking) "Đang kiểm tra…" else "Kiểm tra cập nhật") }
        }
    }
}

private fun openApkInstaller(context: Context, file: File) {
    check(file.isFile) { "File cập nhật đã bị dọn khỏi bộ nhớ. Hãy tải lại APK." }
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    context.startActivity(Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    })
}
