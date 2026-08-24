package com.exambuilder.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.exambuilder.android.ui.navigation.ExamBuilderNavHost
import com.exambuilder.android.ui.theme.ExamBuilderTheme
import com.exambuilder.android.viewmodel.ExamViewModel

class MainActivity : ComponentActivity() {

    private val viewModel: ExamViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            ExamBuilderTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    ExamBuilderNavHost(viewModel)
                }
            }
        }
    }
}
