package com.exambuilder.android.sync

import com.exambuilder.android.BuildConfig
import com.exambuilder.android.data.dto.LIBRARY_FILENAME
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.Collections

class GistClientTest {
    private data class Request(val method: String, val path: String, val auth: String?, val body: String)
    private lateinit var server: TestHttpServer
    private lateinit var client: GistClient
    private val requests = Collections.synchronizedList(mutableListOf<Request>())
    private var library = "{\"exams\":[]}"
    private var truncatedUrl: String? = null

    @Before fun start() {
        server = TestHttpServer { request ->
            val method = request.headers["x-http-method-override"] ?: request.method
            val path = request.path
            val auth = request.headers["authorization"]
            val body = request.body
            requests.add(Request(method, path, auth, body))
            var status = 200
            val response = when {
                path == "/user" -> buildJsonObject {
                    put("login", if (auth == "Bearer owner-token") BuildConfig.SHARED_GIST_OWNER else "another-user")
                }.toString()
                path == "/gists/missing" -> {
                    status = 404
                    "{\"message\":\"Not Found\"}"
                }
                path == "/gists" && method == "POST" -> "{\"id\":\"personal-gist\",\"html_url\":\"https://gist.github.com/personal-gist\"}"
                path.startsWith("/gists/") && method == "GET" -> buildJsonObject {
                    put("files", buildJsonObject {
                        put(LIBRARY_FILENAME, buildJsonObject {
                            if (truncatedUrl != null) {
                                put("truncated", true)
                                put("raw_url", truncatedUrl!!)
                            } else put("content", library)
                        })
                    })
                }.toString()
                path.startsWith("/gists/") && method == "PATCH" -> {
                    val json = Json.parseToJsonElement(body) as JsonObject
                    val files = json["files"] as JsonObject
                    library = ((files[LIBRARY_FILENAME] as JsonObject)["content"] as JsonPrimitive).content
                    buildJsonObject { put("id", BuildConfig.SHARED_GIST_ID) }.toString()
                }
                else -> { status = 400; "{}" }
            }
            TestHttpServer.Response(status, response)
        }
        client = GistClient(server.baseUrl)
    }

    @After fun stop() { server.close() }

    @Test fun sharedPullDoesNotSendTokenEvenIfStoredTokenIsExpired() = runBlocking {
        assertEquals(library, client.getLibrary("expired-token", BuildConfig.SHARED_GIST_ID))
        assertEquals(library, client.getLibrary("", BuildConfig.SHARED_GIST_ID))
        assertTrue(requests.all { it.auth == null && it.method == "GET" })
    }

    @Test fun publicCustomGistCanAlsoBeReadWithoutToken() = runBlocking {
        assertEquals(library, client.getLibrary("", "personal-gist"))
        assertNull(requests.single().auth)
    }

    @Test fun otherAccountCannotPatchSharedLibrary() = runBlocking {
        val result = runCatching { client.updateGist("other-token", BuildConfig.SHARED_GIST_ID, "changed") }
        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull()?.message.orEmpty().contains(BuildConfig.SHARED_GIST_OWNER))
        assertEquals(listOf("/user"), requests.map { it.path })
        assertEquals("{\"exams\":[]}", library)
    }

    @Test fun ownerCanPublishSharedLibrary() = runBlocking {
        client.updateGist("owner-token", BuildConfig.SHARED_GIST_ID, "new library")
        assertEquals(listOf("GET", "PATCH"), requests.map { it.method })
        assertTrue(requests.all { it.auth == "Bearer owner-token" })
        assertEquals("new library", library)
    }

    @Test fun noTokenCannotWrite() = runBlocking {
        assertTrue(runCatching { client.updateGist("", BuildConfig.SHARED_GIST_ID, "changed") }.isFailure)
        assertTrue(runCatching { client.createGist("", "changed") }.isFailure)
        assertTrue(requests.isEmpty())
    }

    @Test fun creatingPersonalGistStillUsesItsOwnersToken() = runBlocking {
        assertEquals("personal-gist", client.createGist("personal-token", library).id)
        val request = requests.single()
        assertEquals("Bearer personal-token", request.auth)
        val json = Json.parseToJsonElement(request.body) as JsonObject
        assertEquals("false", (json["public"] as JsonPrimitive).content)
    }

    @Test fun untrustedRawUrlIsRejectedWithoutForwardingCredentials() = runBlocking {
        truncatedUrl = "https://untrusted.example/collect"
        val result = runCatching { client.getLibrary("owner-token", BuildConfig.SHARED_GIST_ID) }
        assertTrue(result.isFailure)
        assertEquals(1, requests.size)
        assertNull(requests.single().auth)
        assertFalse(requests.any { it.path.contains("collect") })
    }

    @Test fun missingGistKeepsReadableError() = runBlocking {
        val result = runCatching { client.getLibrary("", "missing") }
        assertTrue(result.exceptionOrNull()?.message.orEmpty().contains("404"))
    }
}
