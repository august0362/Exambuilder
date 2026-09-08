package com.exambuilder.android.ui.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color

/**
 * 18 chủ đề màu, chắt lọc từ resources/image/theme/ (Cold / Ocean / Summer /
 * Fall / Winter là chủ đề sáng · Midnight / Pine là chủ đề tối). Đồng bộ hex
 * với frontend/style.css. Mỗi chủ đề là một [ColorScheme] hoàn chỉnh — KHÔNG
 * có "công tắc chế độ tối" riêng nữa.
 */
data class AppTheme(
    val id: String,
    val label: String,
    val dark: Boolean,
    val previewBg: Color,
    val previewBar: Color,
    val previewDot: Color,
    val scheme: ColorScheme
)

private fun c(hex: Long) = Color(hex or 0xFF000000)

val APP_THEMES: List<AppTheme> = listOf(
    AppTheme(
        id = "cold", label = "Xanh lạnh", dark = false,
        previewBg = c(0xE9F2FB), previewBar = c(0x1976D2), previewDot = c(0x0D47A1),
        scheme = lightColorScheme(
            primary = c(0x1976D2), onPrimary = Color.White,
            primaryContainer = c(0xE3F2FD), onPrimaryContainer = c(0x0D47A1),
            secondary = c(0x0F766E), onSecondary = Color.White,
            background = c(0xE9F2FB), onBackground = c(0x13273F),
            surface = c(0xFFFFFF), onSurface = c(0x13273F),
            surfaceVariant = c(0xF3F8FD), onSurfaceVariant = c(0x4C6480),
            outline = c(0x90AAC7), outlineVariant = c(0xCDDFF1), error = c(0xDC2626)
        )
    ),
    AppTheme(
        id = "ocean", label = "Biển", dark = false,
        previewBg = c(0xF2EFE7), previewBar = c(0x33689F), previewDot = c(0x66A3BF),
        scheme = lightColorScheme(
            primary = c(0x33689F), onPrimary = Color.White,
            primaryContainer = c(0xDDE9E6), onPrimaryContainer = c(0x274E78),
            secondary = c(0x5A7D74), onSecondary = Color.White,
            background = c(0xF2EFE7), onBackground = c(0x23303A),
            surface = c(0xFBFAF5), onSurface = c(0x23303A),
            surfaceVariant = c(0xE9E4D6), onSurfaceVariant = c(0x52646F),
            outline = c(0x9AA79F), outlineVariant = c(0xDDD5C4), error = c(0xB3261E)
        )
    ),
    AppTheme(
        id = "meadow", label = "Đồng cỏ", dark = false,
        previewBg = c(0xF3F8E9), previewBar = c(0x3F7D1C), previewDot = c(0x8ECA3C),
        scheme = lightColorScheme(
            primary = c(0x3F7D1C), onPrimary = Color.White,
            primaryContainer = c(0xE7F2D4), onPrimaryContainer = c(0x245F22),
            secondary = c(0x276F27), onSecondary = Color.White,
            background = c(0xF3F8E9), onBackground = c(0x20301A),
            surface = c(0xFFFFFF), onSurface = c(0x20301A),
            surfaceVariant = c(0xEEF4E0), onSurfaceVariant = c(0x4F6242),
            outline = c(0x9DB584), outlineVariant = c(0xD7E5BF), error = c(0xB3261E)
        )
    ),
    AppTheme(
        id = "blossom", label = "Oải hương", dark = false,
        previewBg = c(0xFBF5E6), previewBar = c(0x7A5C8F), previewDot = c(0xB0CDE6),
        scheme = lightColorScheme(
            primary = c(0x7A5C8F), onPrimary = Color.White,
            primaryContainer = c(0xEBE4F0), onPrimaryContainer = c(0x5F4571),
            secondary = c(0x4A7194), onSecondary = Color.White,
            background = c(0xFBF5E6), onBackground = c(0x33292F),
            surface = c(0xFFFCF3), onSurface = c(0x33292F),
            surfaceVariant = c(0xF2E9D4), onSurfaceVariant = c(0x6B5A63),
            outline = c(0xB3A598), outlineVariant = c(0xE6DBC7), error = c(0xB3261E)
        )
    ),
    AppTheme(
        id = "sorbet", label = "Kem trái cây", dark = false,
        previewBg = c(0xFEF2EE), previewBar = c(0xC0453F), previewDot = c(0xBBF1D2),
        scheme = lightColorScheme(
            primary = c(0xC0453F), onPrimary = Color.White,
            primaryContainer = c(0xFBE0D7), onPrimaryContainer = c(0x98342F),
            secondary = c(0x1F7D55), onSecondary = Color.White,
            background = c(0xFEF2EE), onBackground = c(0x3A2622),
            surface = c(0xFFFBF8), onSurface = c(0x3A2622),
            surfaceVariant = c(0xFCE6DD), onSurfaceVariant = c(0x755751),
            outline = c(0xC9A99E), outlineVariant = c(0xF3DDD2), error = c(0xB3261E)
        )
    ),
    AppTheme(
        id = "daylight", label = "Ban ngày", dark = false,
        previewBg = c(0xFEFAEE), previewBar = c(0x3F5FC9), previewDot = c(0xAAC4F5),
        scheme = lightColorScheme(
            primary = c(0x3F5FC9), onPrimary = Color.White,
            primaryContainer = c(0xE4EBFB), onPrimaryContainer = c(0x2F49A0),
            secondary = c(0x4A7194), onSecondary = Color.White,
            background = c(0xFEFAEE), onBackground = c(0x2C2B1F),
            surface = c(0xFFFEF9), onSurface = c(0x2C2B1F),
            surfaceVariant = c(0xFAF1D6), onSurfaceVariant = c(0x615E46),
            outline = c(0xB7AC86), outlineVariant = c(0xECE0BE), error = c(0xB3261E)
        )
    ),
    AppTheme(
        id = "summer", label = "Hè", dark = false,
        previewBg = c(0xFDF3E2), previewBar = c(0xA8562B), previewDot = c(0x6B7A45),
        scheme = lightColorScheme(
            primary = c(0xA8562B), onPrimary = Color.White,
            primaryContainer = c(0xF3E5CF), onPrimaryContainer = c(0x7A3D1C),
            secondary = c(0x6B7A45), onSecondary = Color.White,
            background = c(0xFDF3E2), onBackground = c(0x33291C),
            surface = c(0xFFFAF0), onSurface = c(0x33291C),
            surfaceVariant = c(0xF6E9D1), onSurfaceVariant = c(0x6E5C44),
            outline = c(0xB09A7A), outlineVariant = c(0xE9D6B9), error = c(0xB3261E)
        )
    ),
    AppTheme(
        id = "fall", label = "Thu", dark = false,
        previewBg = c(0xFCF3E6), previewBar = c(0xAF5F2C), previewDot = c(0x3F7C8C),
        scheme = lightColorScheme(
            primary = c(0xAF5F2C), onPrimary = Color.White,
            primaryContainer = c(0xF6E5D0), onPrimaryContainer = c(0x843F16),
            secondary = c(0x3F7C8C), onSecondary = Color.White,
            background = c(0xFCF3E6), onBackground = c(0x302518),
            surface = c(0xFFFDF8), onSurface = c(0x302518),
            surfaceVariant = c(0xF4EAD8), onSurfaceVariant = c(0x6A5A48),
            outline = c(0xA99C88), outlineVariant = c(0xE8D6BD), error = c(0xB3261E)
        )
    ),
    AppTheme(
        id = "winter", label = "Đông", dark = false,
        previewBg = c(0xF0F0EC), previewBar = c(0x6B7259), previewDot = c(0xA3A396),
        scheme = lightColorScheme(
            primary = c(0x6B7259), onPrimary = Color.White,
            primaryContainer = c(0xE4E4DC), onPrimaryContainer = c(0x464B3A),
            secondary = c(0x4B6B57), onSecondary = Color.White,
            background = c(0xF0F0EC), onBackground = c(0x2B2B26),
            surface = c(0xFFFFFF), onSurface = c(0x2B2B26),
            surfaceVariant = c(0xE8E8E2), onSurfaceVariant = c(0x5F5F55),
            outline = c(0xA3A396), outlineVariant = c(0xD6D6CE), error = c(0xB3261E)
        )
    ),
    AppTheme(
        id = "midnight", label = "Xanh đêm", dark = true,
        previewBg = c(0x0A1230), previewBar = c(0x7F9CFF), previewDot = c(0xABD2FA),
        scheme = darkColorScheme(
            primary = c(0x7F9CFF), onPrimary = c(0x0A1230),
            primaryContainer = c(0x1C2A5E), onPrimaryContainer = c(0xABD2FA),
            secondary = c(0x8BBB92), onSecondary = c(0x0A1230),
            background = c(0x0A1230), onBackground = c(0xE4E9F7),
            surface = c(0x121A3F), onSurface = c(0xE4E9F7),
            surfaceVariant = c(0x1A2350), onSurfaceVariant = c(0xA1B2D6),
            outline = c(0x4A5A8F), outlineVariant = c(0x2C3A6B), error = c(0xF87171)
        )
    ),
    AppTheme(
        id = "pine", label = "Rừng đêm", dark = true,
        previewBg = c(0x0A2226), previewBar = c(0x5CC596), previewDot = c(0x8BBB92),
        scheme = darkColorScheme(
            primary = c(0x5CC596), onPrimary = c(0x072022),
            primaryContainer = c(0x123C3B), onPrimaryContainer = c(0x8BBB92),
            secondary = c(0x8BBB92), onSecondary = c(0x072022),
            background = c(0x0A2226), onBackground = c(0xE0EFE4),
            surface = c(0x0F2D31), onSurface = c(0xE0EFE4),
            surfaceVariant = c(0x153A3D), onSurfaceVariant = c(0x95B3A5),
            outline = c(0x446B64), outlineVariant = c(0x28504F), error = c(0xF87171)
        )
    ),
    AppTheme(
        id = "grape", label = "Nho", dark = false,
        previewBg = c(0xEFE7FB), previewBar = c(0x6A3EA8), previewDot = c(0x9564DD),
        scheme = lightColorScheme(
            primary = c(0x6A3EA8), onPrimary = Color.White,
            primaryContainer = c(0xECE2F7), onPrimaryContainer = c(0x4B287D),
            secondary = c(0x6A3EA8), onSecondary = Color.White,
            background = c(0xF3EEFB), onBackground = c(0x241436),
            surface = c(0xFFFFFF), onSurface = c(0x241436),
            surfaceVariant = c(0xEFE8F8), onSurfaceVariant = c(0x574465),
            outline = c(0xA48FC2), outlineVariant = c(0xDDD0EF), error = c(0xB3261E)
        )
    ),
    AppTheme(
        id = "plum", label = "Mận", dark = false,
        previewBg = c(0xF8E2EC), previewBar = c(0x9C3568), previewDot = c(0xBD5579),
        scheme = lightColorScheme(
            primary = c(0x9C3568), onPrimary = Color.White,
            primaryContainer = c(0xF6DEE9), onPrimaryContainer = c(0x78264F),
            secondary = c(0x9C3568), onSecondary = Color.White,
            background = c(0xFCEEF4), onBackground = c(0x371C2B),
            surface = c(0xFFFAFC), onSurface = c(0x371C2B),
            surfaceVariant = c(0xF9E0EC), onSurfaceVariant = c(0x744F60),
            outline = c(0xCC9BB1), outlineVariant = c(0xF1D3E0), error = c(0xB3261E)
        )
    ),
    AppTheme(
        id = "mocha", label = "Cà phê", dark = false,
        previewBg = c(0xEFE7DF), previewBar = c(0x7C5741), previewDot = c(0xAB886D),
        scheme = lightColorScheme(
            primary = c(0x7C5741), onPrimary = Color.White,
            primaryContainer = c(0xEFE5DD), onPrimaryContainer = c(0x5B3D2B),
            secondary = c(0x7C5741), onSecondary = Color.White,
            background = c(0xF4EFEC), onBackground = c(0x2D221A),
            surface = c(0xFFFDFB), onSurface = c(0x2D221A),
            surfaceVariant = c(0xECE2DA), onSurfaceVariant = c(0x6A584A),
            outline = c(0xAB9683), outlineVariant = c(0xDED1C6), error = c(0xB3261E)
        )
    ),
    AppTheme(
        id = "quartz", label = "Thạch anh", dark = false,
        previewBg = c(0xF9E4EC), previewBar = c(0x9C5A7C), previewDot = c(0xC5B3D3),
        scheme = lightColorScheme(
            primary = c(0x9C5A7C), onPrimary = Color.White,
            primaryContainer = c(0xF5E2EC), onPrimaryContainer = c(0x7A4460),
            secondary = c(0x8156A0), onSecondary = Color.White,
            background = c(0xFDF1F2), onBackground = c(0x352730),
            surface = c(0xFFFAFB), onSurface = c(0x352730),
            surfaceVariant = c(0xFBE6E8), onSurfaceVariant = c(0x6F5A64),
            outline = c(0xCAADBB), outlineVariant = c(0xF2DADE), error = c(0xB3261E)
        )
    ),
    AppTheme(
        id = "peach", label = "Đào", dark = false,
        previewBg = c(0xFBE4DC), previewBar = c(0xB45642), previewDot = c(0xEAA07F),
        scheme = lightColorScheme(
            primary = c(0xB45642), onPrimary = Color.White,
            primaryContainer = c(0xFDE3D9), onPrimaryContainer = c(0x8E3F2E),
            secondary = c(0xB45642), onSecondary = Color.White,
            background = c(0xFDF1EE), onBackground = c(0x3B2823),
            surface = c(0xFFFBF9), onSurface = c(0x3B2823),
            surfaceVariant = c(0xFBE7DF), onSurfaceVariant = c(0x7B574E),
            outline = c(0xD3A99E), outlineVariant = c(0xF5DDD4), error = c(0xB3261E)
        )
    ),
    AppTheme(
        id = "rose", label = "Hoa hồng", dark = false,
        previewBg = c(0xFBE1DA), previewBar = c(0xBB4A62), previewDot = c(0xFEBBCC),
        scheme = lightColorScheme(
            primary = c(0xBB4A62), onPrimary = Color.White,
            primaryContainer = c(0xFBDEE4), onPrimaryContainer = c(0x93374B),
            secondary = c(0xBB4A62), onSecondary = Color.White,
            background = c(0xFDEFE4), onBackground = c(0x3A2621),
            surface = c(0xFFFBF6), onSurface = c(0x3A2621),
            surfaceVariant = c(0xFBE7DA), onSurfaceVariant = c(0x7A564D),
            outline = c(0xD6A89C), outlineVariant = c(0xF5DDCB), error = c(0xB3261E)
        )
    ),
    AppTheme(
        id = "honey", label = "Mật ong", dark = false,
        previewBg = c(0xF6E9CF), previewBar = c(0x9E6B30), previewDot = c(0xD8AE7E),
        scheme = lightColorScheme(
            primary = c(0x9E6B30), onPrimary = Color.White,
            primaryContainer = c(0xF8E6C8), onPrimaryContainer = c(0x7C521F),
            secondary = c(0x9E6B30), onSecondary = Color.White,
            background = c(0xFDF4E3), onBackground = c(0x352A19),
            surface = c(0xFFFDF7), onSurface = c(0x352A19),
            surfaceVariant = c(0xF7EBD3), onSurfaceVariant = c(0x6D5C40),
            outline = c(0xB7A079), outlineVariant = c(0xEADDC0), error = c(0xB3261E)
        )
    )
)

fun themeById(id: String): AppTheme = APP_THEMES.firstOrNull { it.id == id } ?: APP_THEMES[0]
