package com.exambuilder.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import com.exambuilder.android.data.AppSettings
import com.exambuilder.android.data.AppSettingsStore
import com.exambuilder.android.ui.navigation.ExamBuilderNavHost
import com.exambuilder.android.ui.theme.ExamBuilderTheme
import com.exambuilder.android.viewmodel.ExamViewModel
import com.exambuilder.android.viewmodel.LibraryViewModel
import com.exambuilder.android.viewmodel.AppUpdateViewModel

class MainActivity : ComponentActivity() {

    private val viewModel: ExamViewModel by viewModels()
    private val libraryViewModel: LibraryViewModel by viewModels()
    private val updateViewModel: AppUpdateViewModel by viewModels()

    override fun onResume() {
        super.onResume()
        updateViewModel.checkForUpdates()
        libraryViewModel.pullOnOpen()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val appSettingsStore = AppSettingsStore(applicationContext)
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                updateViewModel.state.map { it.online }.distinctUntilChanged().collect { online ->
                    if (online) libraryViewModel.pullOnOpen()
                }
            }
        }
        setContent {
            val settings by appSettingsStore.settings.collectAsStateWithLifecycle(initialValue = AppSettings())
            ExamBuilderTheme(
                themeId = settings.themeId,
                fontScale = settings.fontScale
            ) {
                Surface(modifier = Modifier.fillMaxSize()) {
                    ExamBuilderNavHost(viewModel, libraryViewModel, appSettingsStore, updateViewModel)
                }
            }
        }
    }
}
