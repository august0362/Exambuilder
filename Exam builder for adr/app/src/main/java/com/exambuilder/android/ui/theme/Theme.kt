package com.exambuilder.android.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable

/**
 * Chọn một trong 18 chủ đề (xem [APP_THEMES]) + hệ số cỡ chữ, lấy từ
 * [com.exambuilder.android.data.AppSettingsStore]. Mỗi chủ đề tự nó là sáng
 * hoặc tối; không dùng dynamic color (Material You) nữa.
 */
@Composable
fun ExamBuilderTheme(
    themeId: String = "cold",
    fontScale: Float = 1f,
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = themeById(themeId).scheme,
        typography = Typography.scaled(fontScale),
        content = content
    )
}
