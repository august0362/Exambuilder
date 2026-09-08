package com.exambuilder.android.math

/**
 * Splits a question / option / explanation string into plain-text runs and
 * LaTeX formulas so each can be rendered by the right engine:
 *
 *  - plain text  -> Compose [androidx.compose.material3.Text] (system font,
 *    full Vietnamese coverage). Hand-typed ASCII math in it is still upgraded
 *    to Unicode by [MathConvert].
 *  - formula     -> JLaTeXMath, which does real 2-D typesetting (fraction
 *    bars, radicals with a vinculum, `\begin{cases}` systems, matrices, …).
 *
 * Recognised formula delimiters:
 *  - `$$ … $$`                     -> block formula (own line, centred)
 *  - `$ … $`                       -> inline formula
 *  - bare `\begin{env} … \end{env}` for a known math env -> block formula
 *    (AI / users often paste these without `$`).
 *
 * Pure JVM (no Android imports) so it is unit-testable.
 */
sealed interface MathNode {
    data class Text(val text: String) : MathNode
    data class Formula(val latex: String, val block: Boolean) : MathNode
}

private val BLOCK_ENVIRONMENTS = setOf(
    "cases", "matrix", "pmatrix", "bmatrix", "Bmatrix", "vmatrix", "Vmatrix",
    "array", "aligned", "align", "align*", "alignedat", "gathered", "gather", "gather*", "split", "equation", "equation*"
)

private val BEGIN_ENV = Regex("""\\begin\{([A-Za-z*]+)\}""")

fun parseMathNodes(raw: String?): List<MathNode> {
    if (raw.isNullOrEmpty()) return emptyList()
    // Buoc 1: quy MOI cau truc toan 2 chieu ngoai $...$ ve $...$ / $$...$$
    // LaTeX chuan (giao vien go "sqrt(16)", "3/4"; de cu bi lam phang "√80";
    // AI sinh thieu $...). Sau day fast-path trong MathText tu nhuong sang
    // duong JLaTeXMath khi co cau truc that. Port cua web formatMathSymbols.
    val promoted = MathConvert.promoteStructuralMath(raw)
    val out = ArrayList<MathNode>()
    var i = 0
    val n = promoted.length
    val plain = StringBuilder()

    fun flushPlain() {
        if (plain.isNotEmpty()) {
            out.add(MathNode.Text(plain.toString()))
            plain.setLength(0)
        }
    }

    while (i < n) {
        // ---- $$ ... $$ (block) ----
        if (promoted.startsWith("$$", i)) {
            val end = promoted.indexOf("$$", i + 2)
            if (end >= 0) {
                flushPlain()
                out.add(MathNode.Formula(promoted.substring(i + 2, end).trim(), block = true))
                i = end + 2
                continue
            }
        }
        // ---- $ ... $ (inline) ----
        if (promoted[i] == '$') {
            val end = promoted.indexOf('$', i + 1)
            if (end > i) {
                val body = promoted.substring(i + 1, end).trim()
                flushPlain()
                out.add(MathNode.Formula(body, block = looksLikeBlock(body)))
                i = end + 1
                continue
            }
        }
        // ---- bare \begin{env} ... \end{env} ----
        val beginMatch = BEGIN_ENV.matchAt(promoted, i)
        if (beginMatch != null) {
            val env = beginMatch.groupValues[1]
            val endTag = "\\end{$env}"
            val endIdx = promoted.indexOf(endTag, beginMatch.range.last + 1)
            if (endIdx >= 0) {
                flushPlain()
                val latex = promoted.substring(i, endIdx + endTag.length).trim()
                out.add(MathNode.Formula(latex, block = true))
                i = endIdx + endTag.length
                continue
            }
        }
        plain.append(promoted[i])
        i++
    }
    flushPlain()
    return out
}

private fun looksLikeBlock(latex: String): Boolean {
    val env = BEGIN_ENV.find(latex)?.groupValues?.get(1)
    return env != null && env in BLOCK_ENVIRONMENTS
}

/** True when [text] has anything worth handing to a math renderer. */
fun hasMath(text: String?): Boolean =
    !text.isNullOrEmpty() && parseMathNodes(text).any { it is MathNode.Formula }

/**
 * A run of nodes to lay out together: an [Inline] group flows as one line of
 * text (prose + inline formulas), a [Block] formula stands on its own row.
 */
sealed interface MathGroup {
    data class Block(val latex: String) : MathGroup
    data class Inline(val nodes: List<MathNode>) : MathGroup
}

fun groupMathNodes(nodes: List<MathNode>): List<MathGroup> {
    val out = ArrayList<MathGroup>()
    val buffer = ArrayList<MathNode>()
    fun flush() {
        if (buffer.isNotEmpty()) {
            out.add(MathGroup.Inline(buffer.toList()))
            buffer.clear()
        }
    }
    nodes.forEach { node ->
        if (node is MathNode.Formula && node.block) {
            flush()
            out.add(MathGroup.Block(node.latex))
        } else {
            buffer.add(node)
        }
    }
    flush()
    return out
}
