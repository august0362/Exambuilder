package com.exambuilder.android.math

import android.graphics.Bitmap
import android.graphics.Canvas
import ru.noties.jlatexmath.JLatexMathDrawable

/**
 * Non-Compose access to the JLaTeXMath renderer, used by the PDF / DOCX
 * exporters. JLaTeXMath auto-initialises via its bundled `ContentProvider`,
 * so no setup call is needed.
 */
object LatexImage {

    /** @return the rendered formula as a [JLatexMathDrawable], or null on a parse error. */
    fun drawable(latex: String, textSizePx: Float, colorArgb: Int): JLatexMathDrawable? =
        runCatching {
            JLatexMathDrawable.builder(latex)
                .textSize(textSizePx)
                .color(colorArgb)
                .align(JLatexMathDrawable.ALIGN_LEFT)
                .build()
        }.getOrNull()

    /** @return the rendered formula rasterised to an ARGB_8888 [Bitmap], or null on a parse error. */
    fun bitmap(latex: String, textSizePx: Float, colorArgb: Int): Bitmap? {
        val d = drawable(latex, textSizePx, colorArgb) ?: return null
        val w = d.intrinsicWidth.coerceAtLeast(1)
        val h = d.intrinsicHeight.coerceAtLeast(1)
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        d.setBounds(0, 0, w, h)
        d.draw(Canvas(bmp))
        return bmp
    }
}
