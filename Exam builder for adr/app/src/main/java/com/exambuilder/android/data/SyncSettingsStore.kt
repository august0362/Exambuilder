package com.exambuilder.android.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import com.exambuilder.android.BuildConfig

private val Context.syncDataStore by preferencesDataStore(name = "exambuilder_sync")

data class SyncSettings(
    val githubToken: String = "",
    val gistId: String = BuildConfig.SHARED_GIST_ID,
    val lastSyncedAt: String = "",
    val autoPull: Boolean = true
) {
    val hasToken: Boolean get() = githubToken.isNotBlank()
    val isSharedGist: Boolean get() = gistId == BuildConfig.SHARED_GIST_ID
}

/**
 * Luu token GitHub + Gist ID + thoi diem dong bo gan nhat. Token luu PLAINTEXT
 * (cung muc voi API key LLM ben web) - xem canh bao bao mat trong README.
 */
class SyncSettingsStore(private val context: Context) {

    private object Keys {
        val TOKEN = stringPreferencesKey("github_token")
        val GIST_ID = stringPreferencesKey("gist_id")
        val LAST_SYNCED = stringPreferencesKey("last_synced_at")
        val AUTO_PULL = booleanPreferencesKey("auto_pull")
    }

    val settings: Flow<SyncSettings> = context.syncDataStore.data.map { p ->
        SyncSettings(
            githubToken = p[Keys.TOKEN] ?: "",
            gistId = p[Keys.GIST_ID] ?: BuildConfig.SHARED_GIST_ID,
            lastSyncedAt = p[Keys.LAST_SYNCED] ?: "",
            autoPull = p[Keys.AUTO_PULL] ?: true
        )
    }

    suspend fun setToken(token: String) {
        context.syncDataStore.edit { it[Keys.TOKEN] = token.trim() }
    }

    suspend fun setGistId(gistId: String) {
        context.syncDataStore.edit { it[Keys.GIST_ID] = gistId.trim() }
    }

    suspend fun setLastSyncedAt(iso: String) {
        context.syncDataStore.edit { it[Keys.LAST_SYNCED] = iso }
    }

    suspend fun setAutoPull(enabled: Boolean) {
        context.syncDataStore.edit { it[Keys.AUTO_PULL] = enabled }
    }
}
