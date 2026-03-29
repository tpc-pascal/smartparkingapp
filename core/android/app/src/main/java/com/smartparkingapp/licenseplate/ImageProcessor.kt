package com.smartparkingapp.licenseplate

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Color
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.PI

object ImageProcessor {

    fun changeContrast(src: Bitmap): Bitmap {
        val width = src.width
        val height = src.height
        val grayscale = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val pixels = IntArray(width * height)
        src.getPixels(pixels, 0, width, 0, 0, width, height)

        val lum = IntArray(width * height)
        for (i in pixels.indices) {
            val r = Color.red(pixels[i])
            val g = Color.green(pixels[i])
            val b = Color.blue(pixels[i])
            lum[i] = (0.299 * r + 0.587 * g + 0.114 * b).toInt()
        }

        val hist = IntArray(256)
        for (l in lum) {
            if (l in 0..255) hist[l]++
        }

        val cdf = IntArray(256)
        cdf[0] = hist[0]
        for (i in 1 until 256) {
            cdf[i] = cdf[i - 1] + hist[i]
        }
        val total = width * height
        val cdfMin = cdf.firstOrNull { it > 0 } ?: 0

        val eq = IntArray(256)
        for (i in 0 until 256) {
            eq[i] = ((cdf[i] - cdfMin).toFloat() / (total - cdfMin).toFloat() * 255f).toInt().coerceIn(0, 255)
        }

        val claheLum = IntArray(width * height) { i -> eq[lum[i].coerceIn(0, 255)] }

        for (i in pixels.indices) {
            val l = claheLum[i].coerceIn(0, 255)
            val r = (l * 1.1f).toInt().coerceIn(0, 255)
            val g = (l * 1.0f).toInt().coerceIn(0, 255)
            val b = (l * 0.9f).toInt().coerceIn(0, 255)
            pixels[i] = Color.rgb(r, g, b)
        }
        grayscale.setPixels(pixels, 0, width, 0, 0, width, height)
        return grayscale
    }

    private fun sobelEdgeDetection(grayscale: IntArray, width: Int, height: Int): IntArray {
        val edges = IntArray(width * height)
        val gx = intArrayOf(-1, 0, 1, -2, 0, 2, -1, 0, 1)
        val gy = intArrayOf(-1, -2, -1, 0, 0, 0, 1, 2, 1)

        for (y in 1 until height - 1) {
            for (x in 1 until width - 1) {
                var sumX = 0
                var sumY = 0
                var idx = 0
                for (ky in -1..1) {
                    for (kx in -1..1) {
                        val pixel = grayscale[(y + ky) * width + (x + kx)]
                        sumX += pixel * gx[idx]
                        sumY += pixel * gy[idx]
                        idx++
                    }
                }
                val magnitude = sqrt((sumX * sumX + sumY * sumY).toFloat()).toInt().coerceIn(0, 255)
                edges[y * width + x] = magnitude
            }
        }
        return edges
    }

    private fun computeLines(edgePixels: IntArray, width: Int, height: Int, minLineLength: Int): List<Line> {
        val lines = mutableListOf<Line>()
        val threshold = 30
        val angleStep = 1
        val rhoStep = 1
        val maxRho = sqrt((width * width + height * height).toFloat()).toInt()
        val numAngleBins = 180 / angleStep
        val numRhoBins = 2 * maxRho / rhoStep

        val accum = Array(numAngleBins) { IntArray(numRhoBins) }

        val edgePoints = mutableListOf<Pair<Int, Int>>()
        for (y in 0 until height) {
            for (x in 0 until width) {
                if (edgePixels[y * width + x] > threshold) {
                    edgePoints.add(Pair(x, y))
                }
            }
        }

        for ((x, y) in edgePoints) {
            for (thetaIdx in 0 until numAngleBins) {
                val theta = thetaIdx * angleStep * PI / 180.0
                val rho = (x * cos(theta) + y * sin(theta)).toInt() + maxRho
                val rhoIdx = (rho / rhoStep).coerceIn(0, numRhoBins - 1)
                accum[thetaIdx][rhoIdx]++
            }
        }

        val peakThreshold = edgePoints.size / 100
        val minGap = (height / 3.0).toInt()

        for (thetaIdx in 0 until numAngleBins) {
            for (rhoIdx in 0 until numRhoBins) {
                if (accum[thetaIdx][rhoIdx] > peakThreshold) {
                    val theta = thetaIdx * angleStep * PI / 180.0
                    val rho = (rhoIdx * rhoStep) - maxRho

                    val cosT = cos(theta)
                    val sinT = sin(theta)
                    val x0 = (cosT * rho).toInt()
                    val y0 = (sinT * rho).toInt()

                    var x1 = (x0 + minLineLength * (-sinT)).toInt()
                    var y1 = (y0 + minLineLength * cosT).toInt()
                    var x2 = (x0 - minLineLength * (-sinT)).toInt()
                    var y2 = (y0 - minLineLength * cosT).toInt()

                    x1 = x1.coerceIn(0, width - 1)
                    y1 = y1.coerceIn(0, height - 1)
                    x2 = x2.coerceIn(0, width - 1)
                    y2 = y2.coerceIn(0, height - 1)

                    lines.add(Line(x1, y1, x2, y2))
                }
            }
        }

        return lines.filter { line ->
            val dx = line.x2 - line.x1
            val dy = line.y2 - line.y1
            val len = sqrt((dx * dx + dy * dy).toFloat())
            len >= minLineLength && abs(dy.toFloat() / if (dx == 0) 1f else dx.toFloat()) < 2f
        }
    }

    fun computeSkew(src: Bitmap, centerThres: Boolean): Double {
        val width = src.width
        val height = src.height
        val pixels = IntArray(width * height)
        src.getPixels(pixels, 0, width, 0, 0, width, height)

        val grayscale = IntArray(width * height) { i ->
            val r = Color.red(pixels[i])
            val g = Color.green(pixels[i])
            val b = Color.blue(pixels[i])
            (0.299 * r + 0.587 * g + 0.114 * b).toInt()
        }

        val edges = sobelEdgeDetection(grayscale, width, height)

        val minLineLength = (width / 1.5).toInt()
        val lines = computeLines(edges, width, height, minLineLength)

        if (lines.isEmpty()) return 1.0

        var minLine = Int.MAX_VALUE
        var minLineIdx = 0
        for ((i, line) in lines.withIndex()) {
            val centerY = (line.y1 + line.y2) / 2
            if (centerThres && centerY < 7) continue
            if (centerY < minLine) {
                minLine = centerY
                minLineIdx = i
            }
        }

        var angle = 0.0
        var count = 0
        val bestLine = lines[minLineIdx]
        val ang = atan2(
            (bestLine.y2 - bestLine.y1).toDouble(),
            (bestLine.x2 - bestLine.x1).toDouble()
        )
        if (abs(ang) <= 30.0 * PI / 180.0) {
            angle += ang
            count++
        }

        if (count == 0) return 0.0
        return (angle / count) * 180.0 / PI
    }

    fun rotateImage(src: Bitmap, angle: Double): Bitmap {
        val matrix = Matrix()
        matrix.postRotate(angle.toFloat(), (src.width / 2f), (src.height / 2f))
        return Bitmap.createBitmap(src, 0, 0, src.width, src.height, matrix, true)
    }

    fun deskew(src: Bitmap, changeCons: Boolean, centerThres: Int): Bitmap {
        val processed = if (changeCons) changeContrast(src) else src
        val skewAngle = computeSkew(processed, centerThres == 1)
        return rotateImage(src, skewAngle)
    }

    data class Line(val x1: Int, val y1: Int, val x2: Int, val y2: Int)
}
