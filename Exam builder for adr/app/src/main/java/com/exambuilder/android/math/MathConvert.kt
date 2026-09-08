package com.exambuilder.android.math

/**
 * Native LaTeX / hand-typed-math -> Unicode converter.
 *
 * The web client renders `$...$` spans with KaTeX inside a real browser. On
 * Android we deliberately DO NOT spin up one WebView per question inside a
 * LazyColumn (jank + memory). Instead we flatten LaTeX to Unicode exactly the
 * way the web already does for its Word export (`latexToPlainText` in
 * backend/parser/mathFormat.js) and then lift `^{...}` / `_{...}` into real
 * super/subscript runs (see [segments]) so exponents and indices still read
 * correctly.
 *
 * This is a direct port of backend/parser/mathFormat.js — keep the two in
 * sync. The regex table order matters: longer / more specific patterns and
 * ones that depend on an earlier step's output must come first.
 *
 * Deliberately free of any Android / Compose imports so it is plain-JVM
 * unit-testable (see MathConvertTest).
 */
object MathConvert {

    private val SUPERSCRIPT = mapOf(
        '0' to '⁰', '1' to '¹', '2' to '²', '3' to '³', '4' to '⁴',
        '5' to '⁵', '6' to '⁶', '7' to '⁷', '8' to '⁸', '9' to '⁹'
    )
    private val GREEK = mapOf(
        "alpha" to "α", "beta" to "β", "gamma" to "γ", "delta" to "δ", "theta" to "θ",
        "pi" to "π", "phi" to "φ", "lambda" to "λ", "mu" to "μ", "omega" to "ω"
    )
    private const val GREEK_CHARS = "αβγδθπφλμω"
    private const val TRIG = "arcsin|arccos|arctan|sin|cos|tan|cot|sec|csc|log|ln"
    private val MATHBB = mapOf("R" to "ℝ", "N" to "ℕ", "Z" to "ℤ", "Q" to "ℚ", "C" to "ℂ")
    private val ROOTS = mapOf(2 to "√", 3 to "∛", 4 to "∜")

    private fun sup(digits: String) = digits.map { SUPERSCRIPT[it] ?: it }.joinToString("")
    private fun wrapIfExpression(s: String) = if (s.any { it == '+' || it == '-' }) "($s)" else s
    private fun wrapSqrtContent(s: String) = if (Regex("^[0-9]+$").matches(s)) s else "($s)"
    private fun rootSymbolFor(n: Int) = ROOTS[n] ?: (sup(n.toString()) + "√")

    private class Rule(val re: Regex, val fn: (MatchResult) -> CharSequence)

    private fun r(pattern: String, vararg opts: RegexOption, fn: (MatchResult) -> CharSequence) =
        Rule(Regex(pattern, opts.toSet()), fn)

    private val RULES: List<Rule> = listOf(
        // --- LaTeX commands that carry no payload ---
        r("""\\left""") { "" },
        r("""\\right""") { "" },

        // --- Greek letters ---
        r("""\\(alpha|beta|gamma|delta|theta|pi|phi|lambda|mu|omega)\b""") { m -> GREEK.getValue(m.groupValues[1]) },

        // --- trig / log function names (drop the backslash, keep the name) ---
        r("""\\(arcsin|arccos|arctan|sin|cos|tan|cot|sec|csc|log|ln|lim|min|max|exp)\b""") { m -> m.groupValues[1] },

        // --- implicit multiplication: "αcos" -> "α.cos" once the backslashes are gone ---
        r("""([${GREEK_CHARS}0-9)])($TRIG)\b""") { m -> m.groupValues[1] + "." + m.groupValues[2] },

        // --- multiplication / division / sign ---
        r("""\\cdot\b""") { "×" },
        r("""\\times\b""") { "×" },
        r("""\\div\b""") { "÷" },
        r("""\\pm\b""") { "±" },
        r("""\\mp\b""") { "∓" },

        // --- comparison / implication / set relations (command form) ---
        r("""\\ge\b""") { "≥" },
        r("""\\le\b""") { "≤" },
        r("""\\ne\b""") { "≠" },
        r("""\\Leftrightarrow\b""") { "⇔" },
        r("""\\Rightarrow\b""") { "⇒" },
        r("""\\Leftarrow\b""") { "⇐" },
        r("""\\to\b""") { "→" },
        r("""\\in\b""") { "∈" },
        r("""\\notin\b""") { "∉" },

        // --- \mathbb{X} -> blackboard-bold letters for the usual number sets ---
        r("""\\mathbb\{([^{}]*)\}""") { m -> MATHBB[m.groupValues[1]] ?: m.groupValues[1] },

        // --- degrees (^\circ, ^{\circ}, or a lone \circ) ---
        r("""\^\{?\\circ\}?""") { "°" },
        r("""\\circ\b""") { "°" },

        // --- \text{...} keeps only its content ---
        r("""\\text\{([^{}]*)\}""") { m -> m.groupValues[1] },

        // --- \widehat{X} -> X + combining circumflex ---
        r("""\\widehat\{([^{}]*)\}""") { m -> m.groupValues[1] + "\u0302" },

        // --- nth root \sqrt[n]{x} (must run before plain \sqrt{...}) ---
        r("""\\sqrt\[([0-9]+)\]\{([^{}]*)\}""") { m -> rootSymbolFor(m.groupValues[1].toInt()) + wrapSqrtContent(m.groupValues[2]) },

        // --- square root ---
        r("""\\sqrt\{([^{}]*)\}""") { m -> "√" + wrapSqrtContent(m.groupValues[1]) },

        // --- fraction \frac{a}{b} -> a/b (parenthesise a sum/difference) ---
        r("""\\frac\{([^{}]*)\}\{([^{}]*)\}""") { m -> wrapIfExpression(m.groupValues[1]) + "/" + wrapIfExpression(m.groupValues[2]) },

        // --- drop the $ delimiters (we render Unicode, not real LaTeX) ---
        r("""\$""") { "" },

        // --- hand-typed ASCII: longer sequences before their prefixes ---
        r("""<=>""") { "⇔" },
        r("""<->""") { "↔" },
        r("""=>""") { "⇒" },
        r("""->""") { "→" },
        r("""<=""") { "≤" },
        r(""">=""") { "≥" },
        r("""!=""") { "≠" },
        r("""\+-""") { "±" },
        r("""sqrt\(""", RegexOption.IGNORE_CASE) { "√(" },
        r("""\b(mm|cm|dm|km|m)([0-9])\b""", RegexOption.IGNORE_CASE) { m ->
            m.groupValues[1] + (SUPERSCRIPT[m.groupValues[2][0]] ?: m.groupValues[2][0])
        },
        r("""\^([0-9]+)""") { m -> sup(m.groupValues[1]) },
        r("""([a-zA-Z0-9)])\s*\*\s*([a-zA-Z0-9(])""") { m -> m.groupValues[1] + " × " + m.groupValues[2] }
    )

    private fun applyRules(text: String): String {
        // Iterate to a fixed point: nested constructs (a root inside a root)
        // need several passes because one pass only resolves the inner-most
        // `{...}`-free layer.
        var result = text
        repeat(5) {
            val next = RULES.fold(result) { acc, rule -> rule.re.replace(acc, rule.fn) }
            if (next == result) return next
            result = next
        }
        return result
    }

    /**
     * Full flatten, including everything inside `$...$`. Mirrors the web's
     * `latexToPlainText()`. Use this for exports (PDF / Word) and anywhere a
     * plain [String] is needed. Tolerant of malformed input such as an
     * unclosed `$2x^2` — the stray `$` is simply removed.
     */
    fun toPlainText(text: String?): String {
        if (text.isNullOrEmpty()) return ""
        return applyRules(text)
    }

    private val MATH_SPAN = Regex("""\$\$[^$]+\$\$|\$[^$]+\$""")

    /**
     * Boc moi cau truc toan 2 chieu ngoai `$...$` thanh `$...$` / `$$...$$`
     * LaTeX chuan (can, phan so, can bac n, he phuong trinh...). Port cua web
     * `promoteStructuralMath` - xem [MathPromote]. Idempotent.
     */
    fun promoteStructuralMath(text: String?): String = MathPromote.promote(text)

    /**
     * Convert hand-typed ASCII math OUTSIDE `$...$` to Unicode while keeping
     * every `$...$` span verbatim (delimiters included). Mirrors the web's
     * `formatMathSymbols()` — step 1 boc cau truc 2 chieu thanh `$...$`
     * (promoteStructuralMath), step 2 lam dep ky hieu 1 hang o vung ngoai
     * `$...$`. Dung khi normalising text go vao editor.
     */
    fun normalizeInput(text: String?): String {
        if (text.isNullOrEmpty()) return ""
        val promoted = promoteStructuralMath(text)
        val sb = StringBuilder()
        var last = 0
        for (m in MATH_SPAN.findAll(promoted)) {
            if (m.range.first > last) sb.append(applyRules(promoted.substring(last, m.range.first)))
            sb.append(m.value)
            last = m.range.last + 1
        }
        sb.append(applyRules(promoted.substring(last)))
        return sb.toString()
    }

    enum class Script { NONE, SUPER, SUB }
    data class Span(val text: String, val script: Script)

    /**
     * Flatten, then split into runs — lifting `^{...}` / `_{...}` (and the
     * single-token `^x` / `_x` forms) into [Script.SUPER] / [Script.SUB] runs
     * so a renderer can draw them raised / lowered and smaller.
     */
    fun segments(text: String?): List<Span> {
        val flat = toPlainText(text)
        if (flat.isEmpty()) return emptyList()
        val out = ArrayList<Span>()
        val buf = StringBuilder()
        fun flush() {
            if (buf.isNotEmpty()) {
                out.add(Span(buf.toString(), Script.NONE)); buf.setLength(0)
            }
        }
        var i = 0
        while (i < flat.length) {
            val c = flat[i]
            if ((c == '^' || c == '_') && i + 1 < flat.length) {
                val token = readScriptToken(flat, i + 1)
                if (token != null) {
                    flush()
                    out.add(Span(token.first, if (c == '^') Script.SUPER else Script.SUB))
                    i = token.second
                    continue
                }
            }
            buf.append(c)
            i++
        }
        flush()
        return out
    }

    /** @return (token, indexAfterToken) or null when there is nothing scriptable. */
    private fun readScriptToken(s: String, start: Int): Pair<String, Int>? {
        if (start >= s.length) return null
        return when (s[start]) {
            '{' -> readBalanced(s, start, '{', '}')
            '(' -> readBalanced(s, start, '(', ')')?.let { (inner, next) -> "($inner)" to next }
            ' ', '\t', '\n', '^', '_' -> null
            else -> s[start].toString() to (start + 1)
        }
    }

    private fun readBalanced(s: String, open: Int, o: Char, c: Char): Pair<String, Int>? {
        var depth = 1
        var j = open + 1
        val sb = StringBuilder()
        while (j < s.length && depth > 0) {
            val ch = s[j]
            if (ch == o) depth++
            else if (ch == c) {
                depth--
                if (depth == 0) return sb.toString() to (j + 1)
            }
            sb.append(ch)
            j++
        }
        return null
    }
}
