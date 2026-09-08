package com.exambuilder.android.ui.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.IosShare
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.compose.composable
import com.exambuilder.android.data.AppSettingsStore
import com.exambuilder.android.ui.screens.ExamBuilderScreen
import com.exambuilder.android.ui.screens.ExportScreen
import com.exambuilder.android.ui.screens.LibraryScreen
import com.exambuilder.android.ui.screens.PreviewScreen
import com.exambuilder.android.ui.screens.SettingsScreen
import com.exambuilder.android.viewmodel.ExamViewModel
import com.exambuilder.android.viewmodel.LibraryViewModel
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.debounce

private enum class Destination(val route: String, val label: String) {
    Builder("builder", "Soạn đề"),
    Preview("preview", "Xem trước"),
    Export("export", "Xuất file"),
    Library("library", "Kho đề"),
    Settings("settings", "Cài đặt")
}

@OptIn(FlowPreview::class)
@Composable
fun ExamBuilderNavHost(
    viewModel: ExamViewModel,
    libraryViewModel: LibraryViewModel,
    appSettingsStore: AppSettingsStore
) {
    val navController = rememberNavController()

    // Tu dong luu moi de vao kho: theo doi state cua trinh soan, debounce 1.2s.
    LaunchedEffect(Unit) {
        snapshotFlow { viewModel.exam }
            .debounce(1_200)
            .collect { exam ->
                libraryViewModel.autoSave(exam, viewModel.currentExamId) { newId ->
                    viewModel.currentExamId = newId
                }
            }
    }

    Scaffold(
        bottomBar = {
            NavigationBar {
                val navBackStackEntry by navController.currentBackStackEntryAsState()
                val currentDestination = navBackStackEntry?.destination

                Destination.entries.forEach { dest ->
                    val icon = when (dest) {
                        Destination.Builder -> Icons.Default.Edit
                        Destination.Preview -> Icons.Default.Visibility
                        Destination.Export -> Icons.Default.IosShare
                        Destination.Library -> Icons.Default.Inventory2
                        Destination.Settings -> Icons.Default.Settings
                    }
                    NavigationBarItem(
                        icon = { Icon(icon, contentDescription = dest.label) },
                        label = { Text(dest.label) },
                        selected = currentDestination?.hierarchy?.any { it.route == dest.route } == true,
                        onClick = {
                            navController.navigate(dest.route) {
                                popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
                    )
                }
            }
        }
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = Destination.Builder.route,
            modifier = Modifier.padding(padding)
        ) {
            composable(Destination.Builder.route) { ExamBuilderScreen(viewModel) }
            composable(Destination.Preview.route) { PreviewScreen(viewModel) }
            composable(Destination.Export.route) { ExportScreen(viewModel) }
            composable(Destination.Library.route) {
                LibraryScreen(
                    libraryViewModel = libraryViewModel,
                    onOpenExam = { archiveId ->
                        libraryViewModel.get(archiveId)?.let { exam ->
                            viewModel.loadExam(exam, archiveId)
                            navController.navigate(Destination.Preview.route) {
                                popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                            }
                        }
                    },
                    onExamDeleted = { deletedId ->
                        if (viewModel.currentExamId == deletedId) viewModel.currentExamId = null
                    }
                )
            }
            composable(Destination.Settings.route) { SettingsScreen(appSettingsStore) }
        }
    }
}
