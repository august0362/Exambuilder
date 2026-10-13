package com.exambuilder.android.model

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TemplateLayoutTest {
    private val binding = Json.parseToJsonElement("""{
      "template_snapshot": {
        "appearance": {"paper":"A5","orientation":"landscape","margins_mm":{"top":12,"bottom":15,"left":20,"right":20}},
        "sections": [{"stimulus":"Read this passage","slots":[{"slot_id":"s1.q1","points":"2.50","answer_space":{"kind":"lined","lines":7}}]}]
      }
    }""") as JsonObject

    @Test fun readsPaperAndSlotFromSnapshot() {
        val exam = Exam(blocks = listOf(QuestionBlock(blockType = BlockType.ESSAY, blockTitle = "Writing", questions = listOf(
            Question(questionType = QuestionType.ESSAY, content = "Write", difficultyLevel = DifficultyLevel.NB, templateSlotId = "s1.q1")
        ))), templateBinding = binding)
        val layout = exam.templateLayout()!!
        assertEquals(595, layout.paper.widthPt)
        assertEquals(420, layout.paper.heightPt)
        assertEquals("2.50", layout.slotAt(0)?.points)
        assertEquals(7, layout.slotAt(0)?.answerLines)
        assertEquals("2.50", layout.slotFor(exam.blocks[0].questions[0], 0)?.points)
        assertNull(layout.slotFor(exam.blocks[0].questions[0].copy(templateSlotId = "missing"), 0))
        assertEquals("Read this passage", layout.sections[0].stimulus)
    }

    @Test fun mismatchedQuestionCountDoesNotApplyPoints() {
        assertNull(Exam(templateBinding = binding).templateLayout())
    }
}
