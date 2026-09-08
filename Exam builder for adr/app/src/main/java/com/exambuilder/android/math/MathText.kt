package com.exambuilder.android.math

import android.graphics.drawable.Drawable
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.takeOrElse
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.Placeholder
import androidx.compose.ui.text.PlaceholderVerticalAlign
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.BaselineShift
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.isSpecified
import androidx.compose.ui.unit.sp

/**
 * Renders a mix of Vietnamese prose and LaTeX math.
 *
 *  - plain text runs -> Compose [Text] with the system font. `x^2`, `sqrt(16)`,
 *    `>=`, `\frac`, Greek letters … typed without `$` are still upgraded to
 *    Unicode by [MathConvert].
 *  - `$…$` / `$$…$$` / bare `\begin{…}` -> JLaTeXMath: real fraction bars,
 *    radicals with a vinculum, `\begin{cases}` systems, matrices, integrals…
 *    Inline formulas are embedded in the text flow via [InlineTextContent];
 *    block formulas get their own horizontally-scrollable row.
 */
@Composable
fun MathText(
    text: String,
    modifier: Modifier = Modifier,
    style: TextStyle = LocalTextStyle.current,
    color: Color = Color.Unspecified,
    fontWeight: FontWeight? = null,
    maxLines: Int = Int.MAX_VALUE,
    overflow: TextOverflow = TextOverflow.Clip,
) {
    val nodes = remember(text) { parseMathNodes(text) }

    // Fast path: no formulas -> plain Unicode text (keeps ^ / _ scripts).
    if (nodes.none { it is MathNode.Formula }) {
        Text(
            text = remember(text) { buildMathAnnotatedString(text) },
            modifier = modifier,
            style = style,
            color = color,
            fontWeight = fontWeight,
            maxLines = maxLines,
            overflow = overflow,
        )
        return
    }

    val resolvedColor = color
        .takeOrElse { style.color }
        .takeOrElse { LocalContentColor.current }

    val groups = remember(nodes) { groupMathNodes(nodes) }
    if (groups.size == 1 && groups[0] is MathGroup.Inline) {
        InlineMathText(
            (groups[0] as MathGroup.Inline).nodes,
            modifier, style, resolvedColor, fontWeight, maxLines, overflow
        )
        return
    }

    Column(modifier) {
        groups.forEach { group ->
            when (group) {
                is MathGroup.Block -> BlockFormula(group.latex, style, resolvedColor)
                is MathGroup.Inline -> InlineMathText(
                    group.nodes, Modifier.fillMaxWidth(), style, resolvedColor, fontWeight, maxLines, overflow
                )
            }
        }
    }
}

private sealed interface Piece {
    data class Prose(val text: AnnotatedString) : Piece
    data class Math(val drawable: Drawable, val latex: String) : Piece
}

@Composable
private fun InlineMathText(
    nodes: List<MathNode>,
    modifier: Modifier,
    style: TextStyle,
    color: Color,
    fontWeight: FontWeight?,
    maxLines: Int,
    overflow: TextOverflow,
) {
    val density = LocalDensity.current
    val colorArgb = color.toArgb()
    val fontSizePx = with(density) {
        (if (style.fontSize.isSpecified) style.fontSize else 16.sp).toPx()
    }

    val pieces = remember(nodes, fontSizePx, colorArgb) {
        nodes.map { node ->
            when (node) {
                is MathNode.Text -> Piece.Prose(buildMathAnnotatedString(node.text))
                is MathNode.Formula -> {
                    val d = LatexImage.drawable(node.latex, fontSizePx, colorArgb)
                    if (d != null) Piece.Math(d, node.latex) else Piece.Prose(buildMathAnnotatedString(node.latex))
                }
            }
        }
    }

    val annotated = remember(pieces) {
        buildAnnotatedString {
            pieces.forEachIndexed { i, piece ->
                when (piece) {
                    is Piece.Prose -> append(piece.text)
                    is Piece.Math -> appendInlineContent("math_$i", piece.latex)
                }
            }
        }
    }

    val inlineContent = buildMap {
        pieces.forEachIndexed { i, piece ->
            if (piece is Piece.Math) {
                val w = with(density) { piece.drawable.intrinsicWidth.toFloat().toSp() }
                val h = with(density) { piece.drawable.intrinsicHeight.toFloat().toSp() }
                put(
                    "math_$i",
                    InlineTextContent(Placeholder(w, h, PlaceholderVerticalAlign.TextCenter)) {
                        DrawableCanvas(piece.drawable)
                    }
                )
            }
        }
    }

    Text(
        text = annotated,
        modifier = modifier,
        style = style,
        color = color,
        fontWeight = fontWeight,
        maxLines = maxLines,
        overflow = overflow,
        inlineContent = inlineContent,
    )
}

@Composable
private fun BlockFormula(latex: String, style: TextStyle, color: Color) {
    val density = LocalDensity.current
    val colorArgb = color.toArgb()
    val fontSizePx = with(density) {
        (if (style.fontSize.isSpecified) style.fontSize else 16.sp).toPx()
    }
    val drawable = remember(latex, fontSizePx, colorArgb) {
        LatexImage.drawable(latex, fontSizePx, colorArgb)
    }
    if (drawable == null) {
        Text(buildMathAnnotatedString(latex), style = style, color = color)
        return
    }
    val wDp = with(density) { drawable.intrinsicWidth.toDp() }
    val hDp = with(density) { drawable.intrinsicHeight.toDp() }
    Box(
        Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(vertical = 4.dp)
    ) {
        Canvas(Modifier.size(wDp, hDp)) { drawDrawable(drawable) }
    }
}

@Composable
private fun DrawableCanvas(drawable: Drawable) {
    Canvas(Modifier.fillMaxSize()) { drawDrawable(drawable) }
}

private fun DrawScope.drawDrawable(drawable: Drawable) {
    drawIntoCanvas { canvas ->
        drawable.setBounds(0, 0, size.width.toInt(), size.height.toInt())
        drawable.draw(canvas.nativeCanvas)
    }
}

/** Plain-text Unicode fallback: converts LaTeX / ASCII to Unicode, lifts ^ / _ into scripts. */
fun buildMathAnnotatedString(text: String?): AnnotatedString = buildAnnotatedString {
    for (span in MathConvert.segments(text)) {
        when (span.script) {
            MathConvert.Script.NONE -> append(span.text)
            MathConvert.Script.SUPER ->
                withStyle(SpanStyle(baselineShift = BaselineShift.Superscript, fontSize = 0.72.em)) { append(span.text) }
            MathConvert.Script.SUB ->
                withStyle(SpanStyle(baselineShift = BaselineShift.Subscript, fontSize = 0.72.em)) { append(span.text) }
        }
    }
}
