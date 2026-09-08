package com.exambuilder.android.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.time.Instant

private val Context.appDataStore by preferencesDataStore(name = "exambuilder_app")

/**
 * Tuỳ chỉnh giao diện: chủ đề màu (mỗi chủ đề là một bảng màu HOÀN CHỈNH, có
 * chủ đề sáng và chủ đề tối riêng — không có công tắc "chế độ tối" tách rời)
 * và cỡ chữ. Lưu cục bộ (DataStore), cùng kiểu với [SyncSettingsStore].
 *
 * [themeUpdatedAt] = mốc thời gian (ISO) lần cuối người dùng đổi theme — dùng
 * để đồng bộ theme qua Gist ("lần đổi gần nhất thắng"). Cỡ chữ KHÔNG đồng bộ.
 */
data class AppSettings(
    val themeId: String = "cold",
    val fontScale: Float = 1f,
    val themeUpdatedAt: String = ""
)

private val THEME_MIGRATE = mapOf(
    "blue" to "cold", "teal" to "ocean", "forest" to "meadow", "amber" to "summer", "violet" to "blossom"
)

class AppSettingsStore(private val context: Context) {

    private object Keys {
        val THEME = stringPreferencesKey("theme_id")
        val FONT = floatPreferencesKey("font_scale")
        val THEME_AT = stringPreferencesKey("theme_updated_at")
    }

    val settings: Flow<AppSettings> = context.appDataStore.data.map { p ->
        val raw = p[Keys.THEME] ?: "cold"
        AppSettings(
            themeId = THEME_MIGRATE[raw] ?: raw,
            fontScale = p[Keys.FONT] ?: 1f,
            themeUpdatedAt = p[Keys.THEME_AT] ?: ""
        )
    }

    /** Người dùng tự đổi theme -> đóng dấu thời điểm hiện tại (để đồng bộ). */
    suspend fun setThemeId(id: String) {
        context.appDataStore.edit {
            it[Keys.THEME] = id
            it[Keys.THEME_AT] = Instant.now().toString()
        }
    }

    /** Áp theme nhận từ Gist -> giữ NGUYÊN VĂN mốc thời gian của bản đó. */
    suspend fun applySyncedTheme(id: String, updatedAt: String?) {
        context.appDataStore.edit {
            it[Keys.THEME] = id
            it[Keys.THEME_AT] = updatedAt ?: Instant.now().toString()
        }
    }

    suspend fun setFontScale(scale: Float) {
        context.appDataStore.edit { it[Keys.FONT] = scale }
    }
}
