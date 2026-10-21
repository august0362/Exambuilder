package com.exambuilder.android.sync

import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.SocketException

/** HTTP fixture dung Java SE, khong phu thuoc module jdk.httpserver cua JDK. */
internal class TestHttpServer(private val handler: (Request) -> Response) : AutoCloseable {
    data class Request(val method: String, val path: String, val headers: Map<String, String>, val body: String)
    data class Response(val status: Int, val body: String)
    private val socket = ServerSocket(0, 10, InetAddress.getByName("127.0.0.1"))
    val baseUrl = "http://127.0.0.1:" + socket.localPort
    private val thread = Thread {
        while (!socket.isClosed) {
            val client = try { socket.accept() } catch (_: SocketException) { break }
            client.use { connection ->
                connection.soTimeout = 5000
                val input = connection.getInputStream()
                val line = readLine(input) ?: return@use
                val parts = line.split(' ', limit = 3)
                val headers = mutableMapOf<String, String>()
                while (true) {
                    val header = readLine(input) ?: break
                    if (header.isEmpty()) break
                    val colon = header.indexOf(':')
                    if (colon > 0) headers[header.substring(0, colon).lowercase()] = header.substring(colon + 1).trim()
                }
                val content = ByteArray(headers["content-length"]?.toIntOrNull() ?: 0)
                var offset = 0
                while (offset < content.size) {
                    val count = input.read(content, offset, content.size - offset)
                    if (count < 0) break
                    offset += count
                }
                val response = handler(Request(parts[0], parts[1], headers, content.toString(Charsets.UTF_8)))
                val bytes = response.body.toByteArray(Charsets.UTF_8)
                connection.getOutputStream().apply {
                    write(("HTTP/1.1 " + response.status + " Response\r\nContent-Type: application/json\r\nContent-Length: " +
                        bytes.size + "\r\nConnection: close\r\n\r\n").toByteArray(Charsets.US_ASCII))
                    write(bytes)
                    flush()
                }
            }
        }
    }.apply { isDaemon = true; start() }

    private fun readLine(input: InputStream): String? {
        val output = ByteArrayOutputStream()
        while (true) {
            val next = input.read()
            if (next < 0) return if (output.size() == 0) null else output.toString("UTF-8")
            if (next == 10) return output.toString("UTF-8").removeSuffix("\r")
            output.write(next)
        }
    }

    override fun close() {
        socket.close()
        thread.join(1000)
    }
}
