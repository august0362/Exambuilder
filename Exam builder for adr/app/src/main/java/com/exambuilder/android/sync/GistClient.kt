package com.exambuilder.android.sync

import com.exambuilder.android.BuildConfig
import com.exambuilder.android.data.dto.LIBRARY_FILENAME
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.net.URLEncoder

data class GistRef(val id: String, val htmlUrl: String)

/** Doc kho chung khong can token; ghi van can token cua chu Gist. */
class GistClient(private val api: String = "https://api.github.com") {
    private val description = "ExamBuilder - thu vien de kiem tra (dong bo PC <-> Android)"
    private val maxResponseBytes = 10 * 1024 * 1024

    suspend fun getLibrary(token: String, gistId: String): String? = withContext(Dispatchers.IO) {
        require(gistId.isNotBlank()) { "Chưa cấu hình Gist ID." }
        val shared = gistId == BuildConfig.SHARED_GIST_ID
        val readToken = if (shared) "" else token
        val (code, body) = httpRequest("GET", gistUrl(gistId), readToken, null)
        if (code !in 200..299) throw errorFor(code, body)
        val file = (parseObject(body)["files"] as? JsonObject)?.get(LIBRARY_FILENAME) as? JsonObject
        if (file == null) {
            if (shared) throw IOException("Kho đề chung chưa có file thư viện.")
            return@withContext null
        }
        if (string(file, "truncated") == "true") {
            val rawUrl = string(file, "raw_url")
            val uri = URI(rawUrl)
            check(uri.scheme == "https" && uri.host == "gist.githubusercontent.com" && uri.userInfo == null &&
                uri.port == -1 && uri.rawPath.orEmpty().contains("/$gistId/raw/")) {
                "Đường dẫn file Gist không hợp lệ."
            }
            // File raw doc cong khai; khong chuyen token sang host tai file.
            val (rawCode, rawBody) = httpRequest("GET", rawUrl, "", null)
            if (rawCode !in 200..299) throw errorFor(rawCode, rawBody)
            return@withContext rawBody
        }
        string(file, "content").ifBlank { null }
    }

    suspend fun createGist(token: String, content: String): GistRef = withContext(Dispatchers.IO) {
        require(token.isNotBlank()) { "Chưa cấu hình GitHub token." }
        val payload = buildJsonObject {
            put("description", description)
            put("public", false)
            put("files", libraryFile(content))
        }.toString()
        val (code, body) = httpRequest("POST", "$api/gists", token, payload)
        if (code !in 200..299) throw errorFor(code, body)
        reference(body)
    }

    suspend fun updateGist(token: String, gistId: String, content: String): GistRef = withContext(Dispatchers.IO) {
        require(token.isNotBlank()) { "Chưa cấu hình GitHub token." }
        require(gistId.isNotBlank()) { "Chưa cấu hình Gist ID." }
        if (gistId == BuildConfig.SHARED_GIST_ID) {
            val (userCode, userBody) = httpRequest("GET", "$api/user", token, null)
            if (userCode !in 200..299) throw errorFor(userCode, userBody)
            check(string(parseObject(userBody), "login").equals(BuildConfig.SHARED_GIST_OWNER, ignoreCase = true)) {
                "Chỉ tài khoản " + BuildConfig.SHARED_GIST_OWNER + " được đẩy lên kho đề chung. Bạn vẫn có thể kéo về không cần token."
            }
        }
        val payload = buildJsonObject { put("files", libraryFile(content)) }.toString()
        val (code, body) = httpRequest("PATCH", gistUrl(gistId), token, payload)
        if (code !in 200..299) throw errorFor(code, body)
        reference(body)
    }

    private fun gistUrl(gistId: String) = "$api/gists/" + URLEncoder.encode(gistId, "UTF-8")

    private fun libraryFile(content: String) = buildJsonObject {
        put(LIBRARY_FILENAME, buildJsonObject { put("content", content) })
    }

    private fun reference(body: String): GistRef {
        val obj = parseObject(body)
        val id = string(obj, "id")
        check(id.isNotBlank()) { "GitHub không trả về Gist ID." }
        return GistRef(id, string(obj, "html_url"))
    }

    private fun parseObject(body: String): JsonObject =
        runCatching { Json.parseToJsonElement(body) as JsonObject }
            .getOrElse { throw IOException("GitHub trả về nội dung Gist không hợp lệ.") }

    private fun string(obj: JsonObject, key: String) = (obj[key] as? JsonPrimitive)?.content.orEmpty()

    private fun httpRequest(method: String, url: String, token: String, body: String?): Pair<Int, String> {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 30_000
            instanceFollowRedirects = false
            if (token.isNotBlank()) setRequestProperty("Authorization", "Bearer $token")
            setRequestProperty("Accept", "application/vnd.github+json")
            setRequestProperty("X-GitHub-Api-Version", "2022-11-28")
            setRequestProperty("User-Agent", "ExamBuilder-Android")
            try {
                requestMethod = method
            } catch (e: java.net.ProtocolException) {
                if (method != "PATCH") throw e
                requestMethod = "POST"
                setRequestProperty("X-HTTP-Method-Override", "PATCH")
            }
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
            }
        }
        try {
            if (body != null) conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val output = ByteArrayOutputStream()
            stream?.use { input ->
                val buffer = ByteArray(8192)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    check(output.size() + count <= maxResponseBytes) { "Thư viện trên Gist quá lớn." }
                    output.write(buffer, 0, count)
                }
            }
            return code to output.toString("UTF-8")
        } catch (e: IOException) {
            throw IOException("Lỗi kết nối GitHub: " + e.message, e)
        } finally {
            conn.disconnect()
        }
    }

    private fun errorFor(code: Int, body: String): Exception {
        val detail = runCatching { string(parseObject(body), "message") }.getOrDefault("")
            .let { if (it.isNotBlank()) " - $it" else "" }
        val msg = when (code) {
            401 -> "GitHub từ chối token (HTTP 401$detail). Kiểm tra lại Personal Access Token."
            403 -> "GitHub chặn yêu cầu (HTTP 403$detail). Kiểm tra quyền của tài khoản hoặc thử lại sau."
            404 -> "Không tìm thấy Gist (HTTP 404$detail). Kiểm tra lại Gist ID."
            429 -> "GitHub giới hạn tần suất (HTTP 429$detail). Thử lại sau ít phút."
            else -> "Lỗi GitHub API (HTTP $code$detail)."
        }
        return IOException(msg)
    }
}
