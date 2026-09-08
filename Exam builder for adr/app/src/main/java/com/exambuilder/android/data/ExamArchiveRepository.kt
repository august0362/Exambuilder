package com.exambuilder.android.data

import android.content.Context
import com.exambuilder.android.data.dto.LIBRARY_SCHEMA
import com.exambuilder.android.data.dto.LibraryFile
import com.exambuilder.android.data.dto.LibraryJson
import com.exambuilder.android.data.dto.SavedExamDto
import com.exambuilder.android.data.dto.toSavedExamDto
import com.exambuilder.android.model.Exam
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File
import java.time.Instant
import java.util.UUID

/**
 * Kho de cuc bo cua app Android = 1 file JSON trong filesDir, cung cau truc
 * voi file tren Gist va bang SAVED_EXAM cua backend web. Xoa = dat deleted_at
 * (tombstone), giu ban ghi lai de lan Push con lan duoc len Gist.
 */
class ExamArchiveRepository(private val context: Context) {

    private val file: File get() = File(context.filesDir, "exam-library.json")
    private val ioMutex = Mutex()

    private val _entries = MutableStateFlow<List<SavedExamDto>>(emptyList())
    /** Toan bo ban ghi ke ca tombstone (dung cho dong bo). */
    val entries: StateFlow<List<SavedExamDto>> = _entries.asStateFlow()

    /** Chi cac de con song, moi sua len dau — dung cho danh sach UI. */
    val activeExams: List<SavedExamDto>
        get() = _entries.value.filter { !it.isDeleted }.sortedByDescending { it.updatedAt ?: "" }

    private fun nowIso() = Instant.now().toString()

    suspend fun load() = withContext(Dispatchers.IO) {
        ioMutex.withLock {
            _entries.value = readFileLocked().exams
        }
    }

    fun get(id: String): SavedExamDto? = _entries.value.firstOrNull { it.examId == id && !it.isDeleted }

    suspend fun asLibrary(): LibraryFile =
        LibraryFile(schema = LIBRARY_SCHEMA, updatedAt = nowIso(), exams = _entries.value)

    /**
     * Tao moi (id == null) hoac cap nhat tai cho de trong kho. Giong backend:
     * KHONG hoi sinh de da bi xoa — neu id tro toi 1 tombstone thi tao ban ghi
     * moi thay vi go deleted_at.
     * Tra ve exam_id da dung.
     */
    suspend fun upsert(exam: Exam, id: String?): String = withContext(Dispatchers.IO) {
        ioMutex.withLock {
            val current = readFileLocked().exams.toMutableList()
            // Chi coi la "cap nhat tai cho" khi id tro toi mot de con song.
            val idx = id?.let { wanted -> current.indexOfFirst { it.examId == wanted && !it.isDeleted } } ?: -1
            val examId = if (idx >= 0) id!! else UUID.randomUUID().toString()
            val createdAt = if (idx >= 0) current[idx].createdAt else null
            val dto = exam.toSavedExamDto(examId = examId, createdAt = createdAt, nowIso = nowIso())
            if (idx >= 0) current[idx] = dto else current.add(dto)

            writeFileLocked(current)
            _entries.value = current
            examId
        }
    }

    suspend fun softDelete(id: String) = withContext(Dispatchers.IO) {
        ioMutex.withLock {
            val current = readFileLocked().exams.toMutableList()
            val idx = current.indexOfFirst { it.examId == id && !it.isDeleted }
            if (idx >= 0) {
                current[idx] = current[idx].copy(deletedAt = nowIso(), updatedAt = nowIso())
                writeFileLocked(current)
                _entries.value = current
            }
        }
    }

    /** Ghi de toan bo kho (dung sau merge khi Push/Pull). */
    suspend fun replaceAll(exams: List<SavedExamDto>) = withContext(Dispatchers.IO) {
        ioMutex.withLock {
            writeFileLocked(exams)
            _entries.value = exams
        }
    }

    // --- file IO (goi trong ioMutex) ---

    private fun readFileLocked(): LibraryFile {
        if (!file.exists()) return LibraryFile(schema = LIBRARY_SCHEMA, updatedAt = nowIso(), exams = emptyList())
        return runCatching {
            val lib = LibraryJson.decodeFromString(LibraryFile.serializer(), file.readText())
            lib.copy(exams = lib.exams.filter { it.examId.isNotBlank() })
        }.getOrElse { LibraryFile(schema = LIBRARY_SCHEMA, updatedAt = nowIso(), exams = emptyList()) }
    }

    private fun writeFileLocked(exams: List<SavedExamDto>) {
        val lib = LibraryFile(schema = LIBRARY_SCHEMA, updatedAt = nowIso(), exams = exams)
        val tmp = File(file.parentFile, file.name + ".tmp")
        tmp.writeText(LibraryJson.encodeToString(LibraryFile.serializer(), lib))
        if (!tmp.renameTo(file)) {
            file.writeText(tmp.readText())
            tmp.delete()
        }
    }
}
