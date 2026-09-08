package com.exambuilder.android.sync

import com.exambuilder.android.data.dto.LIBRARY_FILENAME
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

data class GistRef(val id: String, val htmlUrl: String)

/**
 * Cung 3 thao tac voi backend/sync/gistClient.js, chay bang HttpURLConnection
 * (khong them thu vien mang). Gist dat public=false (secret) nhung KHONG ma hoa.
 */
class GistClient {

    private val api = "https://api.github.com"
    private val description = "ExamBuilder - thu vien de kiem tra (dong bo PC <-> Android)"

    /** Noi dung file thu vien (chuoi JSON) hoac null neu gist chua co file do. */
    suspend fun getLibrary(token: String, gistId: String): String? = withContext(Dispatchers.IO) {
        require(token.isNotBlank()) { "Chưa cấu hình GitHub token." }
        require(gistId.isNotBlank()) { "Chưa cấu hình Gist ID." }

        val (code, body) = httpRequest("GET", "$api/gists/$gistId", token, null)
        if (code !in 200..299) throw errorFor(code, body)

        val files = JSONObject(body).optJSONObject("files") ?: return@withContext null
        val file = files.optJSONObject(LIBRARY_FILENAME) ?: return@withContext null
        if (file.optBoolean("truncated", false)) {
            val rawUrl = file.optString("raw_url", "")
            if (rawUrl.isNotBlank()) {
                val (rc, rb) = httpRequest("GET", rawUrl, token, null)
                if (rc !in 200..299) throw errorFor(rc, rb)
                return@withContext rb
            }
        }
        file.optString("content").ifBlank { null }
    }

    suspend fun createGist(token: String, content: String): GistRef = withContext(Dispatchers.IO) {
        require(token.isNotBlank()) { "Chưa cấu hình GitHub token." }
        val payload = JSONObject()
            .put("description", description)
            .put("public", false)
            .put("files", JSONObject().put(LIBRARY_FILENAME, JSONObject().put("content", content)))
            .toString()
        val (code, body) = httpRequest("POST", "$api/gists", token, payload)
        if (code !in 200..299) throw errorFor(code, body)
        val obj = JSONObject(body)
        GistRef(id = obj.getString("id"), htmlUrl = obj.optString("html_url"))
    }

    suspend fun updateGist(token: String, gistId: String, content: String): GistRef = withContext(Dispatchers.IO) {
        require(token.isNotBlank()) { "Chưa cấu hình GitHub token." }
        require(gistId.isNotBlank()) { "Chưa cấu hình Gist ID." }
        val payload = JSONObject()
            .put("files", JSONObject().put(LIBRARY_FILENAME, JSONObject().put("content", content)))
            .toString()
        val (code, body) = httpRequest("PATCH", "$api/gists/$gistId", token, payload)
        if (code !in 200..299) throw errorFor(code, body)
        val obj = JSONObject(body)
        GistRef(id = obj.getString("id"), htmlUrl = obj.optString("html_url"))
    }

    private fun httpRequest(method: String, url: String, token: String, body: String?): Pair<Int, String> {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 30_000
            setRequestProperty("Authorization", "Bearer $token")
            setRequestProperty("Accept", "application/vnd.github+json")
            setRequestProperty("X-GitHub-Api-Version", "2022-11-28")
            setRequestProperty("User-Agent", "ExamBuilder-Android")
            // HttpURLConnection tren Android (OkHttp) ho tro PATCH truc tiep; neu
            // ban runtime nao do tu choi thi fallback POST + method override.
            try {
                requestMethod = method
            } catch (e: java.net.ProtocolException) {
                if (method == "PATCH") {
                    requestMethod = "POST"
                    setRequestProperty("X-HTTP-Method-Override", "PATCH")
                } else throw e
            }
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
            }
        }
        try {
            if (body != null) conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else (conn.errorStream ?: conn.inputStream)
            val text = stream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            return code to text
        } catch (e: IOException) {
            throw IOException("Lỗi kết nối GitHub: ${e.message}", e)
        } finally {
            conn.disconnect()
        }
    }

    private fun errorFor(code: Int, body: String): Exception {
        val detail = runCatching { JSONObject(body).optString("message") }.getOrDefault("")
            .let { if (it.isNotBlank()) " - $it" else "" }
        val msg = when (code) {
            401 -> "GitHub từ chối token (HTTP 401$detail). Kiểm tra lại Personal Access Token."
            403 -> "GitHub chặn yêu cầu (HTTP 403$detail). Token thiếu quyền \"gist\" hoặc đang bị giới hạn tần suất."
            404 -> "Không tìm thấy Gist (HTTP 404$detail). Kiểm tra lại Gist ID."
            429 -> "GitHub giới hạn tần suất (HTTP 429$detail). Thử lại sau ít phút."
            else -> "Lỗi GitHub API (HTTP $code$detail)."
        }
        return IOException(msg)
    }
}
