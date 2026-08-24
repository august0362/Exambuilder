package com.exambuilder.android.ui.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.IosShare
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.compose.composable
import com.exambuilder.android.ui.screens.ExamBuilderScreen
import com.exambuilder.android.ui.screens.ExportScreen
import com.exambuilder.android.ui.screens.PreviewScreen
import com.exambuilder.android.viewmodel.ExamViewModel

private enum class Destination(val route: String, val label: String) {
    Builder("builder", "Soạn đề"),
    Preview("preview", "Xem trước"),
    Export("export", "Xuất file")
}

@Composable
fun ExamBuilderNavHost(viewModel: ExamViewModel) {
    val navController = rememberNavController()

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
        }
    }
}
