package com.exambuilder.android.viewmodel

import android.app.Application
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.SystemClock
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
import com.exambuilder.android.sync.AutoPullPolicy
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.first
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
    private val repositoryReady = viewModelScope.async { repo.load() }
    private val autoPullPolicy = AutoPullPolicy()
    private var automaticPullJob: Job? = null

    val archive: StateFlow<List<SavedExamDto>> = repo.entries
        .map { list -> list.filter { !it.isDeleted }.sortedByDescending { it.updatedAt ?: "" } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val settings: StateFlow<SyncSettings> = settingsStore.settings
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SyncSettings())

    private val _syncStatus = MutableStateFlow<String?>(null)
    val syncStatus: StateFlow<String?> = _syncStatus.asStateFlow()

    private val _syncing = MutableStateFlow(false)
    val syncing: StateFlow<Boolean> = _syncing.asStateFlow()

    fun pullOnOpen() {
        if (automaticPullJob?.isActive == true || _syncing.value) return
        automaticPullJob = viewModelScope.launch {
            repositoryReady.await()
            val current = settingsStore.settings.first()
            val connectivity = getApplication<Application>().getSystemService(ConnectivityManager::class.java)
            val capabilities = connectivity.getNetworkCapabilities(connectivity.activeNetwork)
            val online = capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true &&
                capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
            val now = SystemClock.elapsedRealtime()
            if (_syncing.value || !autoPullPolicy.shouldPull(current, online, now)) return@launch
            autoPullPolicy.recordAttempt(current.gistId, now)
            launchSync("⏳ Đang tự động kéo kho đề về...") { syncManager.pull() }?.join()
        }
    }

    fun setAutoPull(enabled: Boolean) = viewModelScope.launch {
        settingsStore.setAutoPull(enabled)
        if (enabled) {
            autoPullPolicy.reset()
            pullOnOpen()
        }
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
        autoPullPolicy.reset()
        pullOnOpen()
    }

    fun push() = launchSync("⏳ Đang đẩy lên Gist...") { syncManager.push() }
    fun pull() = launchSync("⏳ Đang kéo về từ Gist...") { syncManager.pull() }

    /** "Tạo Gist ID mới": xoá Gist ID hiện tại rồi Push -> SyncManager tự tạo Gist mới. */
    fun createNewGist() = launchSync("⏳ Đang tạo Gist mới và đẩy kho đề lên...") {
        settingsStore.setGistId("")
        syncManager.push()
    }

    private fun launchSync(pending: String, op: suspend () -> SyncResult): Job? {
        if (_syncing.value) return null
        _syncing.value = true
        _syncStatus.value = pending
        return viewModelScope.launch {
            try {
                repositoryReady.await()
                _syncStatus.value = when (val result = op()) {
                    is SyncResult.Ok -> {
                        val tail = if (result.tombstones > 0) ", ${result.tombstones} đã xóa" else ""
                        val verb = if (result.direction == "push") "Đã đẩy lên" else "Đã kéo về"
                        "✅ $verb: ${result.active} đề đang lưu$tail."
                    }
                    is SyncResult.Error -> "❌ ${result.message}"
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _syncStatus.value = "❌ " + (e.message ?: "Không thể đồng bộ kho đề.")
            } finally {
                _syncing.value = false
            }
        }
    }
}
