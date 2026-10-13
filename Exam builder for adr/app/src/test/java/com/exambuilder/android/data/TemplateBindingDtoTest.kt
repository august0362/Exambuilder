package com.exambuilder.android.data

import com.exambuilder.android.data.dto.LibraryFile
import com.exambuilder.android.data.dto.LibraryJson
import com.exambuilder.android.data.dto.SavedExamDto
import com.exambuilder.android.data.dto.toExam
import com.exambuilder.android.data.dto.toSavedExamDto
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Test

class TemplateBindingDtoTest {
    @Test fun bindingSurvivesLibraryOpenAndSave() {
        val binding = buildJsonObject {
            put("schema_version", 1)
            put("template_id", "builtin.t10")
            put("template_version", 1)
            put("future_field", "preserve-me")
        }
        val source = LibraryFile(exams = listOf(SavedExamDto(examId = "exam-1", templateBinding = binding)))
        val decoded = LibraryJson.decodeFromString(LibraryFile.serializer(), LibraryJson.encodeToString(LibraryFile.serializer(), source))
        val opened = decoded.exams.single().toExam()
        val saved = opened.toSavedExamDto("exam-1", null, "2026-10-11T00:00:00Z")
        assertEquals(binding, saved.templateBinding)
    }
}
