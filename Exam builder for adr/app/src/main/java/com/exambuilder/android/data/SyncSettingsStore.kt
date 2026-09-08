package com.exambuilder.android.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.syncDataStore by preferencesDataStore(name = "exambuilder_sync")

data class SyncSettings(
    val githubToken: String = "",
    val gistId: String = "",
    val lastSyncedAt: String = ""
) {
    val hasToken: Boolean get() = githubToken.isNotBlank()
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
    }

    val settings: Flow<SyncSettings> = context.syncDataStore.data.map { p ->
        SyncSettings(
            githubToken = p[Keys.TOKEN] ?: "",
            gistId = p[Keys.GIST_ID] ?: "",
            lastSyncedAt = p[Keys.LAST_SYNCED] ?: ""
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
}
