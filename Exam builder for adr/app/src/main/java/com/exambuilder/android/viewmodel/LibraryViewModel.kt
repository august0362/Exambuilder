package com.exambuilder.android.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.exambuilder.android.data.AppSettingsStore
import com.exambuilder.android.data.ExamArchiveRepository
import com.exambuilder.android.data.SyncSettings
import com.exambuilder.android.data.SyncSettingsStore
import com.exambuilder.android.data.dto.SavedExamDto
import com.exambuilder.android.data.dto.toExam
import com.exambuilder.android.model.Exam
import com.exambuilder.android.sync.SyncManager
import com.exambuilder.android.sync.SyncResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * State cho man hinh "Kho de": danh sach de da luu (tu dong luu moi de),
 * cau hinh dong bo Gist, va 2 thao tac Push / Pull.
 */
class LibraryViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = ExamArchiveRepository(app)
    private val settingsStore = SyncSettingsStore(app)
    private val syncManager = SyncManager(repo, settingsStore, AppSettingsStore(app))

    val archive: StateFlow<List<SavedExamDto>> = repo.entries
        .map { list -> list.filter { !it.isDeleted }.sortedByDescending { it.updatedAt ?: "" } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val settings: StateFlow<SyncSettings> = settingsStore.settings
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SyncSettings())

    private val _syncStatus = MutableStateFlow<String?>(null)
    val syncStatus: StateFlow<String?> = _syncStatus.asStateFlow()

    private val _syncing = MutableStateFlow(false)
    val syncing: StateFlow<Boolean> = _syncing.asStateFlow()

    init {
        viewModelScope.launch { repo.load() }
    }

    fun get(id: String): Exam? = repo.get(id)?.toExam()

    /** Tu dong luu de dang soan. Tra ve exam_id (moi hoac cu) qua [onSaved]. */
    fun autoSave(exam: Exam, currentId: String?, onSaved: (String) -> Unit) {
        if (exam.blocks.isEmpty()) return
        viewModelScope.launch {
            val id = repo.upsert(exam, currentId)
            if (id != currentId) onSaved(id)
        }
    }

    fun delete(id: String, clearedCurrentId: () -> Unit) {
        viewModelScope.launch {
            repo.softDelete(id)
            clearedCurrentId()
        }
    }

    fun saveToken(token: String) {
        if (token.isNotBlank()) viewModelScope.launch {
            settingsStore.setToken(token)
            _syncStatus.value = "✅ Đã lưu Token."
        }
    }

    fun saveGistId(gistId: String) = viewModelScope.launch {
        settingsStore.setGistId(gistId)
        _syncStatus.value = if (gistId.isBlank()) "Đã xoá Gist ID." else "✅ Đã lưu Gist ID. Bấm \"Kéo về\" để đồng bộ."
    }

    fun push() = launchSync("⏳ Đang đẩy lên Gist...") { syncManager.push() }
    fun pull() = launchSync("⏳ Đang kéo về từ Gist...") { syncManager.pull() }

    /** "Tạo Gist ID mới": xoá Gist ID hiện tại rồi Push -> SyncManager tự tạo Gist mới. */
    fun createNewGist() = launchSync("⏳ Đang tạo Gist mới và đẩy kho đề lên...") {
        settingsStore.setGistId("")
        syncManager.push()
    }

    private fun launchSync(pending: String, op: suspend () -> SyncResult) {
        if (_syncing.value) return
        _syncing.value = true
        _syncStatus.value = pending
        viewModelScope.launch {
            _syncStatus.value = when (val result = op()) {
                is SyncResult.Ok -> {
                    val tail = if (result.tombstones > 0) ", ${result.tombstones} đã xóa" else ""
                    val verb = if (result.direction == "push") "Đã đẩy lên" else "Đã kéo về"
                    "✅ $verb: ${result.active} đề đang lưu$tail."
                }
                is SyncResult.Error -> "❌ ${result.message}"
            }
            _syncing.value = false
        }
    }
}
