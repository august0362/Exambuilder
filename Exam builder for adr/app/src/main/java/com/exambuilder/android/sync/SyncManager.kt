package com.exambuilder.android.sync

import com.exambuilder.android.data.AppSettingsStore
import com.exambuilder.android.data.ExamArchiveRepository
import com.exambuilder.android.data.SyncSettingsStore
import com.exambuilder.android.data.dto.LibraryFile
import com.exambuilder.android.data.dto.ThemeDto
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

sealed interface SyncResult {
    data class Ok(
        val direction: String,     // "push" | "pull"
        val active: Int,
        val tombstones: Int,
        val gistId: String
    ) : SyncResult

    data class Error(val message: String) : SyncResult
}

/**
 * Ghep repo + cai dat + client. Cung ngu nghia voi backend/routes/syncRoutes.js:
 *  - push: merge(local, cloud) -> ghi Gist + ghi nguoc ve may. Tu tao Gist neu chua co id.
 *  - pull: merge(cloud, local) -> ghi ve may.
 * Noi dung Gist hong -> dung, khong ghi gi (parseStrict). Push/Pull xep hang qua
 * [syncMutex]; ghi ve kho bang mergeFromSync de khong de mat ban sua trong luc cho mang.
 */
class SyncManager(
    private val repo: ExamArchiveRepository,
    private val settingsStore: SyncSettingsStore,
    private val appSettings: AppSettingsStore,
    private val client: GistClient = GistClient()
) {
    private val syncMutex = Mutex()

    suspend fun push(): SyncResult = syncMutex.withLock { pushLocked() }

    suspend fun pull(): SyncResult = syncMutex.withLock { pullLocked() }

    private suspend fun pushLocked(): SyncResult = runCatching {
        val s = settingsStore.settings.first()
        if (!s.hasToken) return SyncResult.Error("Chưa cấu hình GitHub token.")

        val app = appSettings.settings.first()
        val local = repo.asLibrary()
            .copy(theme = ThemeDto(app.themeId, app.themeUpdatedAt.ifBlank { null }))

        var gistId = s.gistId
        val cloud: LibraryFile = if (gistId.isNotBlank()) {
            LibraryMerge.parseStrict(client.getLibrary(s.githubToken, gistId))
        } else {
            LibraryMerge.emptyLibrary()
        }

        // Don tombstone cu SAU khi merge: don truoc thi ban "con song" cu hon tren
        // cloud se thang va lam de da xoa song lai.
        val merged = LibraryMerge.purgeOldTombstones(LibraryMerge.merge(primary = local, secondary = cloud))
        val content = LibraryMerge.stringify(merged)

        gistId = if (gistId.isNotBlank()) {
            client.updateGist(s.githubToken, gistId, content).id
        } else {
            client.createGist(s.githubToken, content).id.also { settingsStore.setGistId(it) }
        }

        repo.mergeFromSync(merged.exams, purgeOldTombstones = true)
        applyMergedTheme(merged, app.themeId)
        settingsStore.setLastSyncedAt(LibraryMerge.nowIso())

        val (_, active, tombstones) = LibraryMerge.summarize(merged)
        SyncResult.Ok("push", active, tombstones, gistId)
    }.getOrElse { SyncResult.Error(it.message ?: "Lỗi đẩy lên Gist") }

    private suspend fun pullLocked(): SyncResult = runCatching {
        val s = settingsStore.settings.first()
        if (!s.hasToken) return SyncResult.Error("Chưa cấu hình GitHub token.")
        if (s.gistId.isBlank()) return SyncResult.Error("Chưa có Gist ID. Hãy \"Đẩy lên\" từ một máy để tạo Gist trước.")

        val app = appSettings.settings.first()
        val cloud = LibraryMerge.parseStrict(client.getLibrary(s.githubToken, s.gistId))
        val local = repo.asLibrary()
            .copy(theme = ThemeDto(app.themeId, app.themeUpdatedAt.ifBlank { null }))

        val merged = LibraryMerge.merge(primary = cloud, secondary = local)
        repo.mergeFromSync(merged.exams)
        applyMergedTheme(merged, app.themeId)
        settingsStore.setLastSyncedAt(LibraryMerge.nowIso())

        val (_, active, tombstones) = LibraryMerge.summarize(merged)
        SyncResult.Ok("pull", active, tombstones, s.gistId)
    }.getOrElse { SyncResult.Error(it.message ?: "Lỗi kéo về từ Gist") }

    /** Nếu bản theme thắng khác theme hiện tại của máy -> áp vào DataStore. */
    private suspend fun applyMergedTheme(merged: LibraryFile, currentThemeId: String) {
        val winner = merged.theme ?: return
        if (winner.id.isNotBlank() && winner.id != currentThemeId) {
            appSettings.applySyncedTheme(winner.id, winner.updatedAt)
        }
    }
}
