package com.exambuilder.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.exambuilder.android.data.AppSettings
import com.exambuilder.android.data.AppSettingsStore
import com.exambuilder.android.ui.theme.APP_THEMES
import com.exambuilder.android.ui.theme.AppTheme
import kotlinx.coroutines.launch

private val FONT_STEPS = listOf(0.9f to "Nhỏ", 1.0f to "Vừa", 1.15f to "Lớn", 1.3f to "Rất lớn")

@Composable
fun SettingsScreen(store: AppSettingsStore) {
    val settings by store.settings.collectAsStateWithLifecycle(initialValue = AppSettings())
    val scope = rememberCoroutineScope()

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp)
    ) {
        Text("Giao diện", style = MaterialTheme.typography.titleLarge)

        Text("Chủ đề màu", style = MaterialTheme.typography.titleMedium)
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            APP_THEMES.chunked(3).forEach { rowThemes ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    rowThemes.forEach { t ->
                        Box(Modifier.weight(1f)) {
                            ThemeCard(
                                theme = t,
                                selected = t.id == settings.themeId,
                                onClick = { scope.launch { store.setThemeId(t.id) } }
                            )
                        }
                    }
                    repeat(3 - rowThemes.size) { Box(Modifier.weight(1f)) {} }
                }
            }
        }

        HorizontalDivider()

        Text("Cỡ chữ", style = MaterialTheme.typography.titleMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FONT_STEPS.forEach { (scale, label) ->
                FilterChip(
                    selected = kotlin.math.abs(settings.fontScale - scale) < 0.001f,
                    onClick = { scope.launch { store.setFontScale(scale) } },
                    label = { Text(label) }
                )
            }
        }

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Xem thử", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("Câu 1: Kết quả của phép tính (-5) + 3 là bao nhiêu?", fontWeight = FontWeight.Medium)
                Text(
                    "Lời giải: (-5) + 3 = -2, vì |-5| > |3| nên kết quả mang dấu âm.",
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.secondary
                )
            }
        }
    }
}

@Composable
private fun ThemeCard(theme: AppTheme, selected: Boolean, onClick: () -> Unit) {
    Column(
        Modifier
            .clip(RoundedCornerShape(10.dp))
            .border(
                width = if (selected) 2.dp else 1.dp,
                color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
                shape = RoundedCornerShape(10.dp)
            )
            .clickable(onClick = onClick)
            .padding(5.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .height(38.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(theme.previewBg)
        ) {
            Box(Modifier.fillMaxWidth().height(11.dp).background(theme.previewBar))
            Box(
                Modifier.align(Alignment.BottomEnd).padding(5.dp).size(11.dp)
                    .clip(CircleShape).background(theme.previewDot)
            )
        }
        Text(
            theme.label + if (theme.dark) " 🌙" else "",
            style = MaterialTheme.typography.labelMedium,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal
        )
    }
}
