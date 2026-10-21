package com.exambuilder.android.update

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import java.net.URI

@Serializable
data class AndroidUpdateManifest(
    val versionCode: Int,
    val versionName: String,
    val minSdk: Int,
    val apkName: String,
    val sha256: String
)

@Serializable
data class ReleaseAsset(
    val name: String,
    val browser_download_url: String,
    val size: Long
)

data class AndroidRelease(
    val manifest: AndroidUpdateManifest,
    val apk: ReleaseAsset,
    val notes: String
)

/** Chi chap nhan APK va metadata cung mot release cua dung repository. */
object AndroidReleases {
    const val MANIFEST_NAME = "android-update.json"
    const val APK_NAME = "ExamBuilder.apk"
    const val MAX_APK_BYTES = 150L * 1024 * 1024
    private val json = Json { ignoreUnknownKeys = true }

    fun assets(raw: String, repository: String): Pair<List<ReleaseAsset>, String> {
        val root = json.parseToJsonElement(raw) as? JsonObject
            ?: error("Thông tin bản phát hành không hợp lệ.")
        check(root["draft"]?.jsonPrimitive?.booleanOrNull == false &&
            root["prerelease"]?.jsonPrimitive?.booleanOrNull == false) {
            "Bản phát hành chưa phải bản ổn định."
        }
        val assets = root["assets"]?.jsonArray?.map {
            json.decodeFromJsonElement(ReleaseAsset.serializer(), it)
        }.orEmpty()
        assets.forEach { checkDownloadUrl(it.browser_download_url, repository) }
        val notes = root["body"]?.jsonPrimitive?.content?.takeUnless { it == "null" }.orEmpty()
        return assets to notes
    }

    fun newerRelease(
        rawManifest: String,
        assets: List<ReleaseAsset>,
        notes: String,
        currentCode: Int,
        sdk: Int
    ): AndroidRelease? {
        val manifest = json.decodeFromString(AndroidUpdateManifest.serializer(), rawManifest)
        check(manifest.versionCode > 0 && manifest.versionName.isNotBlank() && manifest.minSdk >= 26) {
            "Thông tin phiên bản Android không hợp lệ."
        }
        check(manifest.apkName == APK_NAME && Regex("[a-fA-F0-9]{64}").matches(manifest.sha256)) {
            "Thông tin kiểm tra APK không hợp lệ."
        }
        if (manifest.versionCode <= currentCode) return null
        check(manifest.minSdk <= sdk) { "Bản mới cần Android mới hơn trên thiết bị này." }
        val apk = assets.singleOrNull { it.name == manifest.apkName }
            ?: error("Bản phát hành chưa có file $APK_NAME.")
        check(apk.size in 1..MAX_APK_BYTES) { "Kích thước APK không hợp lệ." }
        return AndroidRelease(manifest, apk, notes)
    }

    fun checkDownloadUrl(url: String, repository: String) {
        val uri = URI(url)
        check(uri.scheme == "https" && uri.host == "github.com" && uri.userInfo == null &&
            uri.port == -1 && uri.rawPath.startsWith("/$repository/releases/download/")) {
            "Đường dẫn cập nhật không thuộc GitHub Releases của ứng dụng."
        }
    }
}
