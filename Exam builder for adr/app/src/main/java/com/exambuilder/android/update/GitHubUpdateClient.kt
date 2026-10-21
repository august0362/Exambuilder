package com.exambuilder.android.update

import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.pm.PackageInfoCompat
import com.exambuilder.android.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import java.io.File
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

class GitHubUpdateClient(private val context: Context) {
    private val repository = BuildConfig.UPDATE_REPOSITORY

    suspend fun latest(): AndroidRelease? = withContext(Dispatchers.IO) {
        val raw = readText("https://api.github.com/repos/$repository/releases/latest", 1024 * 1024)
        val (assets, notes) = AndroidReleases.assets(raw, repository)
        val manifest = assets.singleOrNull { it.name == AndroidReleases.MANIFEST_NAME }
            ?: error("Chưa có bản cập nhật Android trên GitHub Releases.")
        val metadata = readText(manifest.browser_download_url, 64 * 1024)
        AndroidReleases.newerRelease(metadata, assets, notes, BuildConfig.VERSION_CODE, Build.VERSION.SDK_INT)
    }

    suspend fun download(release: AndroidRelease, onProgress: (Float) -> Unit): File = withContext(Dispatchers.IO) {
        AndroidReleases.checkDownloadUrl(release.apk.browser_download_url, repository)
        val dir = File(context.cacheDir, "updates").apply { mkdirs() }
        val apk = File(dir, "ExamBuilder-${release.manifest.versionCode}.apk")
        if (apk.isFile && runCatching { verify(apk, release) }.isSuccess) return@withContext apk
        val partial = File(dir, "ExamBuilder-${release.manifest.versionCode}.partial.apk")
        val connection = connect(release.apk.browser_download_url)
        try {
            check(connection.contentLengthLong <= AndroidReleases.MAX_APK_BYTES) { "File cập nhật quá lớn." }
            connection.inputStream.use { input ->
                partial.outputStream().use { output ->
                    val buffer = ByteArray(64 * 1024)
                    var total = 0L
                    var lastPercent = -1
                    while (true) {
                        currentCoroutineContext().ensureActive()
                        val count = input.read(buffer)
                        if (count < 0) break
                        total += count
                        check(total <= release.apk.size) { "Kích thước APK không khớp bản phát hành." }
                        output.write(buffer, 0, count)
                        val percent = (total * 100 / release.apk.size).toInt()
                        if (percent != lastPercent) {
                            onProgress(percent / 100f)
                            lastPercent = percent
                        }
                    }
                    check(total == release.apk.size) { "Tải APK chưa hoàn tất. Hãy thử lại khi có mạng." }
                }
            }
            verify(partial, release)
            check(!apk.exists() || apk.delete()) { "Không thể thay file cập nhật cũ." }
            check(partial.renameTo(apk)) { "Không thể lưu file cập nhật." }
            dir.listFiles()?.filter { it != apk && (it.extension == "apk" || it.extension == "part") }
                ?.forEach { it.delete() }
            apk
        } finally {
            connection.disconnect()
            partial.delete()
        }
    }

    @Suppress("DEPRECATION")
    private fun verify(file: File, release: AndroidRelease) {
        check(file.length() == release.apk.size) { "Kích thước APK không khớp bản phát hành." }
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                digest.update(buffer, 0, count)
            }
        }
        check(hex(digest.digest()).equals(release.manifest.sha256, ignoreCase = true)) {
            "APK tải về bị hỏng hoặc đã thay đổi. Hãy kiểm tra lại bản phát hành."
        }
        val pm = context.packageManager
        val flags = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
        val candidate = pm.getPackageArchiveInfo(file.absolutePath, flags)
            ?: error("Không đọc được file APK cập nhật.")
        check(candidate.packageName == context.packageName) { "APK không thuộc ứng dụng ExamBuilder." }
        val version = PackageInfoCompat.getLongVersionCode(candidate)
        check(version == release.manifest.versionCode.toLong() && version > BuildConfig.VERSION_CODE) {
            "Phiên bản trong APK không khớp thông tin cập nhật."
        }
        check(candidate.versionName == release.manifest.versionName) { "Tên phiên bản trong APK không khớp thông tin cập nhật." }
        check(candidate.applicationInfo?.minSdkVersion?.let { it <= Build.VERSION.SDK_INT } == true) {
            "APK không hỗ trợ phiên bản Android của thiết bị."
        }
        val installed = pm.getPackageInfo(context.packageName, flags)
        val currentSigners = signers(installed)
        check(currentSigners.isNotEmpty() && currentSigners == signers(candidate)) {
            "Khóa ký APK khác với ứng dụng đang cài. Đã dừng cập nhật."
        }
    }

    @Suppress("DEPRECATION")
    private fun signers(info: PackageInfo): Set<String> {
        val signatures = if (Build.VERSION.SDK_INT >= 28) info.signingInfo?.apkContentsSigners else info.signatures
        return signatures.orEmpty().map { hex(MessageDigest.getInstance("SHA-256").digest(it.toByteArray())) }.toSet()
    }

    private fun hex(bytes: ByteArray) = bytes.joinToString("") { "%02x".format(it) }

    private fun readText(url: String, maxBytes: Int): String {
        val connection = connect(url)
        try {
            val bytes = ByteArrayOutputStream()
            connection.inputStream.use { input ->
                val buffer = ByteArray(8192)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    check(bytes.size() + count <= maxBytes) { "Thông tin bản cập nhật quá lớn." }
                    bytes.write(buffer, 0, count)
                }
            }
            return bytes.toString("UTF-8")
        } finally {
            connection.disconnect()
        }
    }

    private fun connect(initialUrl: String): HttpURLConnection {
        var url = URL(initialUrl)
        repeat(6) {
            check(url.protocol == "https" && url.userInfo == null &&
                url.host in setOf("api.github.com", "github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com")) {
                "Máy chủ tải cập nhật không hợp lệ."
            }
            val connection = (url.openConnection() as HttpURLConnection).apply {
                connectTimeout = 15_000
                readTimeout = 30_000
                instanceFollowRedirects = false
                setRequestProperty("User-Agent", "ExamBuilder-Android/${BuildConfig.VERSION_NAME}")
                setRequestProperty("Accept", if (url.host == "api.github.com") "application/vnd.github+json" else "application/octet-stream")
            }
            val status = try { connection.responseCode } catch (e: Exception) {
                connection.disconnect()
                throw e
            }
            if (status in setOf(301, 302, 303, 307, 308)) {
                val location = connection.getHeaderField("Location")
                connection.disconnect()
                check(!location.isNullOrBlank()) { "GitHub không trả về địa chỉ tải APK." }
                url = URL(url, location)
            } else {
                if (status != HttpURLConnection.HTTP_OK) {
                    connection.disconnect()
                    error(when (status) {
                        404 -> "Chưa truy cập được bản phát hành. Kiểm tra kho GitHub công khai và Releases."
                        403, 429 -> "GitHub đang giới hạn lượt kiểm tra. Hãy thử lại sau."
                        else -> "Không thể tải cập nhật từ GitHub (HTTP $status)."
                    })
                }
                return connection
            }
        }
        error("GitHub chuyển hướng tải quá nhiều lần.")
    }
}
