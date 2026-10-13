package com.exambuilder.android.model

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

data class TemplatePaper(
    val widthPt: Int,
    val heightPt: Int,
    val topPt: Float,
    val bottomPt: Float,
    val leftPt: Float,
    val rightPt: Float
)

data class TemplateSlot(val slotId: String, val points: String, val answerKind: String, val answerLines: Int)
data class TemplateSection(val stimulus: String?, val slots: List<TemplateSlot>)
data class TemplateLayout(val paper: TemplatePaper, val sections: List<TemplateSection>) {
    val slots: List<TemplateSlot> get() = sections.flatMap { it.slots }
    fun slotAt(index: Int): TemplateSlot? = slots.getOrNull(index)
    fun slotFor(question: Question, index: Int): TemplateSlot? =
        if (question.templateSlotId != null) slots.firstOrNull { it.slotId == question.templateSlotId }
        else slotAt(index)
}

private fun JsonObject.obj(key: String): JsonObject? = this[key] as? JsonObject
private fun JsonObject.string(key: String): String? = runCatching { this[key]?.jsonPrimitive?.content }.getOrNull()
private fun JsonObject.number(key: String): Float? = string(key)?.toFloatOrNull()
private fun mmToPt(mm: Float): Float = mm * 72f / 25.4f

/**
 * Read only the fields Android can render. If slot counts differ from current
 * blocks, do not display potentially wrong score/answer-space annotations.
 */
fun Exam.templateLayout(): TemplateLayout? {
    val snapshot = templateBinding?.obj("template_snapshot") ?: return null
    val appearance = snapshot.obj("appearance")
    val portrait = if (appearance?.string("paper") == "A5") 420 to 595 else 595 to 842
    val (width, height) = if (appearance?.string("orientation") == "landscape") portrait.second to portrait.first else portrait
    val margins = appearance?.obj("margins_mm")
    fun margin(key: String): Float = mmToPt((margins?.number(key) ?: 18f).coerceIn(8f, 35f))
    val paper = TemplatePaper(width, height, margin("top"), margin("bottom"), margin("left"), margin("right"))
    val sections = (snapshot["sections"] as? JsonArray)?.mapNotNull { raw ->
        val section = raw as? JsonObject ?: return@mapNotNull null
        val slots = (section["slots"] as? JsonArray)?.mapNotNull { item ->
            val slot = item as? JsonObject ?: return@mapNotNull null
            val answer = slot.obj("answer_space")
            TemplateSlot(
                slotId = slot.string("slot_id").orEmpty(),
                points = slot.string("points").orEmpty(),
                answerKind = answer?.string("kind") ?: "none",
                answerLines = (answer?.string("lines")?.toIntOrNull() ?: 0).coerceIn(0, 30)
            )
        } ?: return@mapNotNull null
        TemplateSection(section.string("stimulus")?.takeIf { it.isNotBlank() }, slots)
    } ?: return null
    if (sections.sumOf { it.slots.size } != blocks.sumOf { it.questions.size }) return null
    return TemplateLayout(paper, sections)
}
