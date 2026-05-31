package com.smartparkingapp

import android.graphics.*
import kotlin.math.*

object ImageProcessor {

    fun letterbox(bitmap: Bitmap, size: Int): LetterboxResult {
        val w = bitmap.width
        val h = bitmap.height
        val s = minOf(size.toFloat() / w, size.toFloat() / h)
        val nw = (w * s).toInt()
        val nh = (h * s).toInt()
        val px = (size - nw) / 2
        val py = (size - nh) / 2
        val resized = Bitmap.createScaledBitmap(bitmap, nw, nh, true)
        val padded = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(padded)
        canvas.drawColor(Color.rgb(114, 114, 114))
        canvas.drawBitmap(resized, px.toFloat(), py.toFloat(), null)
        return LetterboxResult(padded, s, px.toFloat(), py.toFloat())
    }

    data class LetterboxResult(
        val bitmap: Bitmap,
        val scale: Float,
        val padX: Float,
        val padY: Float
    )

    fun bitmapToFloatArray(bitmap: Bitmap): FloatArray {
        val w = bitmap.width
        val h = bitmap.height
        val pixels = IntArray(w * h)
        bitmap.getPixels(pixels, 0, w, 0, 0, w, h)
        val floats = FloatArray(3 * h * w)
        for (i in pixels.indices) {
            val p = pixels[i]
            floats[i] = ((p shr 16) and 0xFF) / 255.0f
            floats[i + w * h] = ((p shr 8) and 0xFF) / 255.0f
            floats[i + 2 * w * h] = (p and 0xFF) / 255.0f
        }
        return floats
    }

    fun toGrayscale(bitmap: Bitmap): Bitmap {
        val w = bitmap.width
        val h = bitmap.height
        val result = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val p = IntArray(w * h)
        bitmap.getPixels(p, 0, w, 0, 0, w, h)
        for (i in p.indices) {
            val g = (Color.red(p[i]) * 0.299f + Color.green(p[i]) * 0.587f + Color.blue(p[i]) * 0.114f)
                .toInt().coerceIn(0, 255)
            p[i] = Color.rgb(g, g, g)
        }
        result.setPixels(p, 0, w, 0, 0, w, h)
        return result
    }

    fun enhanceContrast(bitmap: Bitmap): Bitmap {
        val w = bitmap.width
        val h = bitmap.height
        val p = IntArray(w * h)
        bitmap.getPixels(p, 0, w, 0, 0, w, h)
        val hist = IntArray(256)
        for (px in p) hist[Color.red(px)]++
        val cdf = IntArray(256)
        cdf[0] = hist[0]
        for (i in 1 until 256) cdf[i] = cdf[i - 1] + hist[i]
        val total = p.size
        val cdfMin = cdf.first { it > 0 }
        for (i in p.indices) {
            val g = ((cdf[Color.red(p[i])] - cdfMin).toFloat() / (total - cdfMin).toFloat() * 255f)
                .toInt().coerceIn(0, 255)
            p[i] = Color.rgb(g, g, g)
        }
        val result = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        result.setPixels(p, 0, w, 0, 0, w, h)
        return result
    }

    fun computeAngle(bitmap: Bitmap, centerThres: Int): Float {
        val w = bitmap.width
        val h = bitmap.height
        val p = IntArray(w * h)
        bitmap.getPixels(p, 0, w, 0, 0, w, h)

        val gray = FloatArray(w * h)
        for (i in p.indices) gray[i] = Color.red(p[i]).toFloat()

        val gradX = FloatArray(w * h)
        val gradY = FloatArray(w * h)
        for (y in 1 until h - 1) {
            for (x in 1 until w - 1) {
                val idx = y * w + x
                gradX[idx] = -gray[idx - w - 1] - 2 * gray[idx - 1] - gray[idx + w - 1]
                    + gray[idx - w + 1] + 2 * gray[idx + 1] + gray[idx + w + 1]
                gradY[idx] = -gray[idx - w - 1] - 2 * gray[idx - w] - gray[idx - w + 1]
                    + gray[idx + w - 1] + 2 * gray[idx + w] + gray[idx + w + 1]
            }
        }

        val mag = FloatArray(w * h) { sqrt(gradX[it] * gradX[it] + gradY[it] * gradY[it]) }
        val maxMag = mag.maxOrNull() ?: 1f
        val thresh = maxMag * 0.3f

        val pts = mutableListOf<Pair<Int, Int>>()
        for (y in 0 until h) {
            for (x in 0 until w) {
                if (mag[y * w + x] > thresh) pts.add(Pair(x, y))
            }
        }
        if (pts.size < 10) return 0f

        var bestAngle = 0f
        var bestVar = Float.MAX_VALUE
        for (deg in -15..15) {
            val rad = Math.toRadians(deg.toDouble())
            val ca = cos(rad); val sa = sin(rad)
            val proj = FloatArray(h)
            for ((px, py) in pts) {
                val yr = (px * sa + py * ca).toInt()
                if (yr in 0 until h) proj[yr]++
            }
            val mean = proj.sum() / proj.size
            var varSum = 0f
            for (v in proj) varSum += (v - mean) * (v - mean)
            if (varSum < bestVar) { bestVar = varSum; bestAngle = deg.toFloat() }
        }
        return -bestAngle
    }

    fun rotate(bitmap: Bitmap, angle: Float): Bitmap {
        val m = Matrix()
        m.postRotate(angle, bitmap.width / 2f, bitmap.height / 2f)
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, m, true)
    }

    fun deskew(bitmap: Bitmap): Bitmap {
        val gray = toGrayscale(bitmap)
        val enhanced = enhanceContrast(gray)
        val angle = computeAngle(enhanced, 1)
        return if (abs(angle) < 0.5f) bitmap else rotate(bitmap, angle)
    }

    val CHAR_MAP = arrayOf(
        "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
        "A", "B", "C", "D", "E", "F", "G", "H", "K",
        "L", "M", "N", "P", "S", "T", "U", "V", "X", "Y", "Z"
    )

    fun readPlate(chars: List<Detection>): String {
        val centers = chars.map {
            Triple((it.x1 + it.x2) / 2f, (it.y1 + it.y2) / 2f, it.cls)
        }
        if (centers.isEmpty()) return "unknown"

        val left = centers.minBy { it.first }
        val right = centers.maxBy { it.first }
        val yMean = centers.map { it.second }.average().toFloat()
        val twoLine = centers.any { c ->
            abs(c.second - yMean) > 5f
        }

        return if (twoLine) {
            val l1 = centers.filter { it.second <= yMean }.sortedBy { it.first }
            val l2 = centers.filter { it.second > yMean }.sortedBy { it.first }
            if (l1.isEmpty() || l2.isEmpty()) {
                centers.sortedBy { it.first }.joinToString("") { CHAR_MAP[it.third] }
            } else {
                l1.joinToString("") { CHAR_MAP[it.third] } + "-" +
                    l2.joinToString("") { CHAR_MAP[it.third] }
            }
        } else {
            centers.sortedBy { it.first }.joinToString("") { CHAR_MAP[it.third] }
        }
    }

    fun nms(detections: List<Detection>, confThres: Float, iouThres: Float): List<Detection> {
        val filtered = detections.filter { it.conf >= confThres }
            .sortedByDescending { it.conf }
        val result = mutableListOf<Detection>()
        val removed = BooleanArray(filtered.size)
        for (i in filtered.indices) {
            if (removed[i]) continue
            result.add(filtered[i])
            for (j in i + 1 until filtered.size) {
                if (removed[j]) continue
                if (iou(filtered[i], filtered[j]) > iouThres) removed[j] = true
            }
        }
        return result
    }

    private fun iou(a: Detection, b: Detection): Float {
        val x1 = maxOf(a.x1, b.x1); val y1 = maxOf(a.y1, b.y1)
        val x2 = minOf(a.x2, b.x2); val y2 = minOf(a.y2, b.y2)
        if (x1 >= x2 || y1 >= y2) return 0f
        val inter = (x2 - x1) * (y2 - y1)
        val areaA = (a.x2 - a.x1) * (a.y2 - a.y1)
        val areaB = (b.x2 - b.x1) * (b.y2 - b.y1)
        return inter / (areaA + areaB - inter)
    }
}
