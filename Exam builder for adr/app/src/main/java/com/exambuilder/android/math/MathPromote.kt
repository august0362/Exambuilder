package com.exambuilder.android.math

import java.text.Normalizer

/**
 * Port cua backend/parser/mathToLatex.js - giu dong bo tung buoc.
 *
 * "Nang cap" moi cau truc toan 2 CHIEU (can, phan so, can bac n, luy thua
 * chong...) nam NGOAI $...$ thanh cong thuc LaTeX $...$ / $$...$$ chuan, de
 * JLaTeXMath (APK) / KaTeX (web) ve THAT. Ky hieu 1 hang (x^2, <=, ×, do,
 * chu Hy Lap) GIU NGUYEN - MathConvert.RULES lo phan lam dep do sau.
 *
 * IDEMPOTENT: promoteStructuralMath(promoteStructuralMath(x)) == promoteStructuralMath(x).
 *
 * "Hop dong" JS <-> Kotlin: tests/parser/mathPromoteVectors.json (ban Kotlin
 * trong app/src/test/.../MathPromoteTest.kt). Sua bo chuan hoa -> sua CA 2 ben
 * + bang vector.
 *
 * Thuan JVM - KHONG import Android/Compose (de unit-test duoc).
 */
object MathPromote {

    private val SUP_TO_DIGIT: Map<Char, Char> = mapOf(
        '\u2070' to '0', '\u00B9' to '1', '\u00B2' to '2', '\u00B3' to '3', '\u2074' to '4',
        '\u2075' to '5', '\u2076' to '6', '\u2077' to '7', '\u2078' to '8', '\u2079' to '9'
    )
    private val SUPERSCRIPTS = SUP_TO_DIGIT.keys.joinToString("")

    // -----------------------------------------------------------------------
    // Tien ich chung
    // -----------------------------------------------------------------------

    // Dau ")" khop voi "(" tai openIndex (co tinh long nhau). Port cua
    // mathRadical.js :: findMatchingParen.
    private fun findMatchingParen(text: String, openIndex: Int): Int {
        var depth = 0
        for (i in openIndex until text.length) {
            when (text[i]) {
                '(' -> depth++
                ')' -> { depth--; if (depth == 0) return i }
            }
        }
        return -1
    }

    // Dau "}" khop voi "{" tai openIndex (co tinh long nhau).
    private fun matchBrace(s: String, openIndex: Int): Int {
        var depth = 0
        for (i in openIndex until s.length) {
            when (s[i]) {
                '{' -> depth++
                '}' -> { depth--; if (depth == 0) return i }
            }
        }
        return -1
    }

    // Kotlin Regex khong co replaceFirst(input) { transform } - tu lam (mirror
    // JS String.replace(regexKhongCoG, fn) chi thay khop DAU tien).
    private inline fun Regex.replaceFirstMatch(input: String, transform: (MatchResult) -> CharSequence): String {
        val m = find(input) ?: return input
        return input.substring(0, m.range.first) + transform(m) + input.substring(m.range.last + 1)
    }

    private val DOLLAR_WRAP = Regex("""^\$([\s\S]*)\$$""")

    // Bo dung 1 lop $...$ bao ngoai (neu co) va 1 lop (...) bao tron ngoai.
    private fun unwrap(term: String): String {
        var s = term.trim()
        DOLLAR_WRAP.find(s)?.let { s = it.groupValues[1].trim() }
        if (s.startsWith("(") && findMatchingParen(s, 0) == s.length - 1) s = s.substring(1, s.length - 1).trim()
        return s
    }

    private fun plainOf(term: String) = unwrap(term)

    // -----------------------------------------------------------------------
    // isLikelyFraction - port cua backend/parser/mathFraction.js
    // -----------------------------------------------------------------------

    private val FRACTION_BLOCKLIST = setOf(
        "va", "hoac", "hay", "la", "khong", "co", "du", "neu", "thi", "cung",
        "nhung", "nen", "do", "vi", "ma", "nhu", "tuy"
    )
    private val UNIT_TOKENS = setOf(
        "km", "hm", "dam", "m", "dm", "cm", "mm",
        "kg", "hg", "dag", "g", "dg", "cg", "mg", "t",
        "kl", "hl", "dal", "l", "dl", "cl", "ml",
        "h", "s", "ph", "gio", "phut", "giay",
        "m2", "cm2", "mm2", "km2", "dm2", "ha",
        "m3", "cm3", "mm3", "km3", "dm3",
        "mol", "w", "j", "pa", "v", "a", "hz", "ohm"
    )
    private val COMBINING_MARK = Regex("""\p{M}+""")

    private fun stripDiacritics(s: String): String =
        Normalizer.normalize(s, Normalizer.Form.NFD).replace(COMBINING_MARK, "").lowercase()

    private fun normalizeUnitToken(s: String): String =
        stripDiacritics(s).replace("\u00B2", "2").replace("\u00B3", "3")

    private fun isUnitPair(a: String, b: String): Boolean =
        UNIT_TOKENS.contains(normalizeUnitToken(a)) && UNIT_TOKENS.contains(normalizeUnitToken(b))

    private val LOWER_WORD = Regex("""^\p{Ll}+$""")
    private fun isLikelyProseWord(s: String) = LOWER_WORD.matches(s) && s.length >= 3

    private fun isLikelyFraction(rawNum: String, rawDen: String): Boolean {
        val num = rawNum.trim()
        val den = rawDen.trim()
        if (num.isEmpty() || den.isEmpty()) return false
        if (FRACTION_BLOCKLIST.contains(stripDiacritics(num)) || FRACTION_BLOCKLIST.contains(stripDiacritics(den))) return false
        if (isLikelyProseWord(num) || isLikelyProseWord(den)) return false
        if (isUnitPair(num, den)) return false
        return true
    }

    // -----------------------------------------------------------------------
    // bareToLatex: doi 1 bieu thuc toan tho (KHONG con $) sang than LaTeX
    // -----------------------------------------------------------------------

    private val SQRT_CALL = Regex("""\\?sqrt\s*\(""", RegexOption.IGNORE_CASE)

    private fun replaceSqrtCalls(s: String): String {
        val m = SQRT_CALL.find(s) ?: return s
        val open = s.indexOf('(', m.range.first)
        val close = findMatchingParen(s, open)
        if (close < 0) {
            val cut = m.range.first + m.value.length
            return s.substring(0, cut) + replaceSqrtCalls(s.substring(cut))
        }
        val inner = bareToLatex(s.substring(open + 1, close))
        return s.substring(0, m.range.first) + "\\sqrt{$inner}" + replaceSqrtCalls(s.substring(close + 1))
    }

    private val RADICAL_RE = Regex("""([\u2070\u00B9\u00B2\u00B3\u2074\u2075\u2076\u2077\u2078\u2079]*)([\u221A\u221B\u221C])""")

    private fun replaceUnicodeRadicals(s: String): String {
        val m = RADICAL_RE.find(s) ?: return s
        val full = m.value
        val sup = m.groupValues[1]
        val sym = m.groupValues[2]
        val after = m.range.first + full.length
        var index: String? = when (sym) { "\u221B" -> "3"; "\u221C" -> "4"; else -> null }
        if (sup.isNotEmpty()) index = sup.map { SUP_TO_DIGIT[it] }.joinToString("")

        var inner: String? = null
        var end = after
        if (after < s.length && s[after] == '(') {
            val close = findMatchingParen(s, after)
            if (close >= 0) { inner = bareToLatex(s.substring(after + 1, close)); end = close + 1 }
        } else {
            val dm = Regex("""^([0-9]+|[A-Za-z])""").find(s.substring(after))
            if (dm != null) { inner = bareToLatex(dm.groupValues[1]); end = after + dm.groupValues[1].length }
        }
        if (inner == null) {
            return s.substring(0, after) + replaceUnicodeRadicals(s.substring(after))
        }
        val body = "\\sqrt" + (if (index != null) "[$index]" else "") + "{$inner}"
        return s.substring(0, m.range.first) + body + replaceUnicodeRadicals(s.substring(end))
    }

    private val SUPERSCRIPT_RUN = Regex("""[\u2070\u00B9\u00B2\u00B3\u2074\u2075\u2076\u2077\u2078\u2079]+""")
    private val CARET_TOKEN = Regex("""\^(?!\{)([0-9]+|[A-Za-z])""")

    // \u00B2 \u00B3 ... -> ^{2} ; ^12 -> ^{12} ; ^x -> ^{x} ; ^{...} giu nguyen.
    private fun liftSuperscripts(input: String): String {
        var s = SUPERSCRIPT_RUN.replace(input) { mr -> "^{" + mr.value.map { SUP_TO_DIGIT[it] }.joinToString("") + "}" }
        s = CARET_TOKEN.replace(s) { mr -> "^{" + mr.groupValues[1] + "}" }
        return s
    }

    private val MULTI_SPACE = Regex("""\s{2,}""")
    private val STAR_OP = Regex("""\s*\*\s*""")

    private fun bareToLatex(expr: String, keepOuterParens: Boolean = false): String {
        var s = expr.trim()
        DOLLAR_WRAP.find(s)?.let { s = it.groupValues[1].trim() }
        // Ngoac don giao vien go quanh 1 ve phan so mang y nghia gom nhom ->
        // giu nguyen. Chi bo khi KHONG phai ve phan so va ngoac boc tron.
        if (!keepOuterParens && s.startsWith("(") && findMatchingParen(s, 0) == s.length - 1) {
            s = s.substring(1, s.length - 1).trim()
        }
        if (s.isEmpty()) return ""
        s = s.replace("$", "")
        if (s.isBlank()) return ""
        s = replaceSqrtCalls(s)
        s = replaceUnicodeRadicals(s)
        s = convertInnerFractions(s)
        s = liftSuperscripts(s)
        // LUU Y: Regex.replace(input, String) coi "\" trong replacement la ky
        // tu escape -> "\\times" bi an mat "\". Dung dang lambda.
        s = STAR_OP.replace(s) { " \\times " }
            .replace("\u00D7", " \\times ").replace("\u00F7", " \\div ").replace("\u00B7", " \\cdot ")
            .replace("\u00B1", " \\pm ").replace("\u2213", " \\mp ")
            .replace("\u2264", " \\le ").replace("\u2265", " \\ge ").replace("\u2260", " \\ne ")
        return MULTI_SPACE.replace(s, " ").trim()
    }

    // Phan so ben TRONG mot bieu thuc da la LaTeX body. Chi bat dang gon/gon.
    private const val INNER_TERM = """\([^()]*\)|\\sqrt(?:\[[0-9]+\])?\{[^{}]*\}|[0-9A-Za-z.^{}]+"""
    private val INNER_FRACTION = Regex("""($INNER_TERM)/($INNER_TERM)""")

    private fun convertInnerFractions(input: String): String {
        var s = input
        var prev: String? = null
        while (prev != s) {
            prev = s
            s = INNER_FRACTION.replaceFirstMatch(s) { m ->
                val a = m.groupValues[1]; val b = m.groupValues[2]
                if (!isLikelyFraction(unwrap(a), unwrap(b))) m.value
                else "\\frac{" + bareToLatex(a) + "}{" + bareToLatex(b) + "}"
            }
        }
        return s
    }

    // -----------------------------------------------------------------------
    // promoteStructuralMath: boc cau truc thanh $...$
    // -----------------------------------------------------------------------

    private val DOLLAR_SPAN = Regex("""\$\$[^$]*\$\$|\$[^$]+\$""")

    private data class Part(val math: Boolean, val value: String)

    private fun splitProtected(text: String): List<Part> {
        val parts = ArrayList<Part>()
        var last = 0
        for (m in DOLLAR_SPAN.findAll(text)) {
            if (m.range.first > last) parts.add(Part(false, text.substring(last, m.range.first)))
            parts.add(Part(true, m.value))
            last = m.range.last + 1
        }
        if (last < text.length) parts.add(Part(false, text.substring(last)))
        return parts
    }

    private val LATEX_CMD = Regex("""\\(?:sqrt|dfrac|tfrac|frac)\b""")
    private val LATEX_CMD_NAME = Regex("""^\\(sqrt|dfrac|tfrac|frac)""")
    private val TAIL_SCRIPT = Regex("""^(?:\s*[\^_](?:\{[^{}]*\}|[A-Za-z0-9]))+""")
    private val WS = Regex("""\s""")

    // Buoc 1: \sqrt{...}, \sqrt[n]{...}, \frac{...}{...} da hop le -> chi them $.
    private fun wrapLatexCommands(s: String): String {
        val m = LATEX_CMD.find(s) ?: return s
        val start = m.range.first
        val name = LATEX_CMD_NAME.find(s.substring(start))!!.groupValues[1]
        val nArgs = if (name == "sqrt") 1 else 2
        var i = start + m.value.length
        if (name == "sqrt" && i < s.length && s[i] == '[') {
            val rb = s.indexOf(']', i)
            if (rb < 0) return s.substring(0, i) + wrapLatexCommands(s.substring(i))
            i = rb + 1
        }
        repeat(nArgs) {
            while (i < s.length && WS.matches(s[i].toString())) i++
            if (i >= s.length || s[i] != '{') return s.substring(0, i) + wrapLatexCommands(s.substring(i))
            val rb = matchBrace(s, i)
            if (rb < 0) return s.substring(0, i) + wrapLatexCommands(s.substring(i))
            i = rb + 1
        }
        TAIL_SCRIPT.find(s.substring(i))?.let { i += it.value.length }
        val wrapped = "$" + s.substring(start, i).trim() + "$"
        return s.substring(0, start) + wrapped + wrapLatexCommands(s.substring(i))
    }

    // Buoc 2: sqrt(...) ASCII -> $\sqrt{...}$
    private fun wrapSqrtCalls(s: String): String {
        val m = SQRT_CALL.find(s) ?: return s
        val open = s.indexOf('(', m.range.first)
        val close = findMatchingParen(s, open)
        if (close < 0) {
            val cut = m.range.first + m.value.length
            return s.substring(0, cut) + wrapSqrtCalls(s.substring(cut))
        }
        val inner = bareToLatex(s.substring(open + 1, close))
        return s.substring(0, m.range.first) + "\$\\sqrt{$inner}\$" + wrapSqrtCalls(s.substring(close + 1))
    }

    // Buoc 3: \u221A.. / \u221B.. / \u221C.. / superscript\u221A.. -> $\sqrt[n]{...}$
    private fun wrapUnicodeRadicals(s: String): String {
        val m = RADICAL_RE.find(s) ?: return s
        val full = m.value
        val sup = m.groupValues[1]
        val sym = m.groupValues[2]
        val after = m.range.first + full.length
        var index: String? = when (sym) { "\u221B" -> "3"; "\u221C" -> "4"; else -> null }
        if (sup.isNotEmpty()) index = sup.map { SUP_TO_DIGIT[it] }.joinToString("")

        var inner: String? = null
        var end = after
        if (after < s.length && s[after] == '(') {
            val close = findMatchingParen(s, after)
            if (close >= 0) { inner = bareToLatex(s.substring(after + 1, close)); end = close + 1 }
        } else {
            val dm = Regex("""^([0-9]+|[A-Za-z])""").find(s.substring(after))
            if (dm != null) { inner = bareToLatex(dm.groupValues[1]); end = after + dm.groupValues[1].length }
        }
        if (inner == null) return s.substring(0, after) + wrapUnicodeRadicals(s.substring(after))

        val body = "\$\\sqrt" + (if (index != null) "[$index]" else "") + "{$inner}\$"
        return s.substring(0, m.range.first) + body + wrapUnicodeRadicals(s.substring(end))
    }

    // Buoc 4: he so dung truoc cum $...$ ("2$\sqrt{3}$" -> "$2\sqrt{3}$").
    private val LEADING_COEFF = Regex("""(^|[^\\A-Za-z0-9$])([0-9]+)\$(\\[^$]+)\$""")
    private fun absorbLeadingCoefficient(s: String): String =
        LEADING_COEFF.replace(s) { m -> m.groupValues[1] + "$" + m.groupValues[2] + m.groupValues[3] + "$" }

    // Buoc 5: ngoac don om sat cum $...$ ("($2\sqrt{3}$)" -> "$(2\sqrt{3})$").
    private val HUGGING_PARENS = Regex("""\(([-+0-9\s*\u00D7\u00F7\u00B7]*)\$([^$]+)\$([-+0-9\s*\u00D7\u00F7\u00B7]*)\)""")
    private fun absorbHuggingParens(s: String): String =
        HUGGING_PARENS.replace(s) { m ->
            val left = bareToLatex(m.groupValues[1])
            val right = bareToLatex(m.groupValues[3])
            val joined = listOf(left, m.groupValues[2], right).filter { it.isNotEmpty() }
                .joinToString(" ").let { MULTI_SPACE.replace(it, " ") }.trim()
            "\$($joined)\$"
        }

    // Buoc 6: phan so bac ngang qua cac cum $...$.
    private const val FRAC_TERM =
        """\$[^$]+\$|\([^()]*\)|[0-9A-Za-z][0-9A-Za-z.]*|[\u2070\u00B9\u00B2\u00B3\u2074\u2075\u2076\u2077\u2078\u2079]+"""
    private val FRAC_RE = Regex(
        """(?<![\p{L}\p{M}])($FRAC_TERM)(\s{0,2})/(\s{0,2})($FRAC_TERM)(?![\p{L}\p{M}])"""
    )
    private val STRUCTURAL = Regex("""[$\u221A\u221B\u221C]|\\sqrt|\\[dt]?frac""")
    private val REF_WORD = Regex("""(?:cau|bai|trang|hinh|sgk|sbt|ngay)\s*$""")
    private val DOLLAR_STRIP = Regex("""^\$([\s\S]*)\$$""")

    private fun precededByReferenceWord(s: String, idx: Int): Boolean {
        val start = maxOf(0, idx - 16)
        val ctx = stripDiacritics(s.substring(start, idx))
        return REF_WORD.containsMatchIn(ctx)
    }

    private fun innerOf(t: String) = DOLLAR_STRIP.find(t)?.groupValues?.get(1) ?: t
    private fun tight(t: String) = !WS.containsMatchIn(innerOf(t))
    private fun hasStruct(t: String) = STRUCTURAL.containsMatchIn(t)

    private fun mergeFractions(s: String): String {
        val out = StringBuilder()
        var last = 0
        var searchFrom = 0
        while (true) {
            val m = FRAC_RE.find(s, searchFrom) ?: break
            val num = m.groupValues[1]
            val den = m.groupValues[4]
            val eligible = isLikelyFraction(plainOf(num), plainOf(den)) &&
                !precededByReferenceWord(s, m.range.first) &&
                (hasStruct(num) || hasStruct(den) || (tight(num) && tight(den)))
            if (!eligible) {
                searchFrom = m.range.first + num.length + 1
                continue
            }
            out.append(s, last, m.range.first)
                .append("\$\\frac{").append(bareToLatex(num, true))
                .append("}{").append(bareToLatex(den, true)).append("}\$")
            last = m.range.first + m.value.length
            searchFrom = last
        }
        out.append(s, last, s.length)
        return out.toString()
    }

    // Buoc 7: gop cac cum $...$ ke nhau qua toan tu / khoang trang.
    private val ADJACENT_SPANS = Regex("""\$([^$]+)\$([ \t]+|[ \t]*[-+=*\u00D7\u00F7\u00B7][ \t]*)\$([^$]+)\$""")
    private fun mergeAdjacentSpans(input: String): String {
        var s = input
        var prev: String? = null
        while (prev != s) {
            prev = s
            s = ADJACENT_SPANS.replaceFirstMatch(s) { m ->
                val op = m.groupValues[2]
                    .replace("*", " \\times ").replace("\u00D7", " \\times ")
                    .replace("\u00F7", " \\div ").replace("\u00B7", " \\cdot ").trim()
                "$" + m.groupValues[1].trim() + (if (op.isNotEmpty()) " $op " else " ") + m.groupValues[3].trim() + "$"
            }
        }
        return s
    }

    // Buoc 8: nuot toan hang tran ("= 4", "+ 2") ngay sau cum $...$ vao trong.
    private const val TRAILING_OPERAND = """-?\d+(?:[.,]\d+)?|\([-+\d\s*/\u00D7\u00F7\u00B7.]+\)"""
    private val TRAILING_RE = Regex(
        """\$([^$]+)\$([ \t]*[-+=*\u00D7\u00F7\u00B7][ \t]*)($TRAILING_OPERAND)(?![\w\u00B2\u00B3\u2070\u00B9\u2074\u2075\u2076\u2077\u2078\u2079])"""
    )
    private fun absorbTrailingOperand(input: String): String {
        var s = input
        var prev: String? = null
        while (prev != s) {
            prev = s
            s = TRAILING_RE.replace(s) { m ->
                "$" + m.groupValues[1].trim() + " " + m.groupValues[2].trim() + " " + m.groupValues[3].trim() + "$"
            }
        }
        return s
    }

    // Buoc 0: \begin{env}...\end{env} tran ngoai $...$ -> $$...$$ (block).
    private val BLOCK_ENVS = setOf(
        "cases", "matrix", "pmatrix", "bmatrix", "Bmatrix", "vmatrix", "Vmatrix",
        "array", "aligned", "align", "align*", "alignedat", "gathered", "gather",
        "gather*", "split", "equation", "equation*"
    )
    private val BEGIN_ENV = Regex("""\\begin\{([A-Za-z]+\*?)\}""")

    private fun wrapBlockEnvironments(text: String): String =
        splitProtected(text).joinToString("") { p ->
            if (p.math) return@joinToString p.value
            val s = p.value
            val out = StringBuilder()
            var cursor = 0
            var searchFrom = 0
            while (true) {
                val m = BEGIN_ENV.find(s, searchFrom) ?: break
                if (m.range.first < cursor || !BLOCK_ENVS.contains(m.groupValues[1])) {
                    searchFrom = m.range.first + m.value.length
                    continue
                }
                val endTag = "\\end{" + m.groupValues[1] + "}"
                val endIdx = s.indexOf(endTag, m.range.first + m.value.length)
                if (endIdx < 0) { searchFrom = m.range.first + m.value.length; continue }
                val stop = endIdx + endTag.length
                out.append(s, cursor, m.range.first).append("$$").append(s.substring(m.range.first, stop)).append("$$")
                cursor = stop
                searchFrom = stop
            }
            out.append(s, cursor, s.length)
            out.toString()
        }

    private val BLOCK_SPAN = Regex("""\$\$[^$]*\$\$""")

    // Chay 1 buoc merge/absorb CHI ngoai cac block $$...$$.
    private fun outsideBlocks(s: String, fn: (String) -> String): String {
        val sb = StringBuilder()
        var last = 0
        for (m in BLOCK_SPAN.findAll(s)) {
            sb.append(fn(s.substring(last, m.range.first)))
            sb.append(m.value)
            last = m.range.last + 1
        }
        sb.append(fn(s.substring(last)))
        return sb.toString()
    }

    private fun onePass(text: String): String {
        var s = wrapBlockEnvironments(text)
        s = splitProtected(s).joinToString("") { p ->
            if (p.math) p.value
            else wrapUnicodeRadicals(wrapSqrtCalls(wrapLatexCommands(p.value)))
        }
        s = outsideBlocks(s, ::absorbLeadingCoefficient)
        s = outsideBlocks(s, ::absorbHuggingParens)
        s = outsideBlocks(s, ::mergeFractions)
        s = outsideBlocks(s, ::mergeAdjacentSpans)
        s = outsideBlocks(s, ::absorbTrailingOperand)
        return s
    }

    // Hard rule 8: dau "$" LE (khong ghep cap) khong duoc lam hong buoc sau.
    private val SENTINEL = "\uF8FF"
    private val DIGIT_DOLLAR = Regex("""(?<=\d)\$|\$(?=\d)""")
    private fun dollarCount(s: String) = s.count { it == '$' }

    private class Guarded(val text: String, val hadSentinel: Boolean)

    private fun guardLoneDollars(text: String): Guarded {
        if (dollarCount(text) % 2 == 0) return Guarded(text, false)
        var out = DIGIT_DOLLAR.replace(text, SENTINEL)
        if (dollarCount(out) % 2 == 1) {
            val last = out.lastIndexOf('$')
            out = out.substring(0, last) + SENTINEL + out.substring(last + 1)
        }
        return Guarded(out, true)
    }

    /** Boc moi cau truc toan 2 chieu ngoai $...$ thanh $...$ LaTeX. Idempotent. */
    fun promote(text: String?): String {
        if (text.isNullOrEmpty()) return text ?: ""
        val guarded = guardLoneDollars(text)
        var result = guarded.text
        for (i in 0 until 6) {
            val next = onePass(result)
            if (next == result) break
            result = next
        }
        return if (guarded.hadSentinel) result.replace(SENTINEL, "$") else result
    }
}
