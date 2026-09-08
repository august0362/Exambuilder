package com.exambuilder.android.sync

import com.exambuilder.android.data.AppSettingsStore
import com.exambuilder.android.data.ExamArchiveRepository
import com.exambuilder.android.data.SyncSettingsStore
import com.exambuilder.android.data.dto.LibraryFile
import com.exambuilder.android.data.dto.ThemeDto
import kotlinx.coroutines.flow.first

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
 */
class SyncManager(
    private val repo: ExamArchiveRepository,
    private val settingsStore: SyncSettingsStore,
    private val appSettings: AppSettingsStore,
    private val client: GistClient = GistClient()
) {

    suspend fun push(): SyncResult = runCatching {
        val s = settingsStore.settings.first()
        if (!s.hasToken) return SyncResult.Error("Chưa cấu hình GitHub token.")

        val app = appSettings.settings.first()
        val local = LibraryMerge.purgeOldTombstones(repo.asLibrary())
            .copy(theme = ThemeDto(app.themeId, app.themeUpdatedAt.ifBlank { null }))

        var gistId = s.gistId
        val cloud: LibraryFile = if (gistId.isNotBlank()) {
            LibraryMerge.parse(client.getLibrary(s.githubToken, gistId))
        } else {
            LibraryMerge.emptyLibrary()
        }

        val merged = LibraryMerge.merge(primary = local, secondary = cloud)
        val content = LibraryMerge.stringify(merged)

        gistId = if (gistId.isNotBlank()) {
            client.updateGist(s.githubToken, gistId, content).id
        } else {
            client.createGist(s.githubToken, content).id.also { settingsStore.setGistId(it) }
        }

        repo.replaceAll(merged.exams)
        applyMergedTheme(merged, app.themeId)
        settingsStore.setLastSyncedAt(LibraryMerge.nowIso())

        val (_, active, tombstones) = LibraryMerge.summarize(merged)
        SyncResult.Ok("push", active, tombstones, gistId)
    }.getOrElse { SyncResult.Error(it.message ?: "Lỗi đẩy lên Gist") }

    suspend fun pull(): SyncResult = runCatching {
        val s = settingsStore.settings.first()
        if (!s.hasToken) return SyncResult.Error("Chưa cấu hình GitHub token.")
        if (s.gistId.isBlank()) return SyncResult.Error("Chưa có Gist ID. Hãy \"Đẩy lên\" từ một máy để tạo Gist trước.")

        val app = appSettings.settings.first()
        val cloud = LibraryMerge.parse(client.getLibrary(s.githubToken, s.gistId))
        val local = repo.asLibrary()
            .copy(theme = ThemeDto(app.themeId, app.themeUpdatedAt.ifBlank { null }))

        val merged = LibraryMerge.merge(primary = cloud, secondary = local)
        repo.replaceAll(merged.exams)
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
