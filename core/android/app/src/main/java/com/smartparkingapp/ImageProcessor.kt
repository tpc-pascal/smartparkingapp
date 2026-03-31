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

    fun changeContrast(bitmap: Bitmap): Bitmap {
        val w = bitmap.width
        val h = bitmap.height
        val pixels = IntArray(w * h)
        bitmap.getPixels(pixels, 0, w, 0, 0, w, h)

        val lArr = FloatArray(w * h)
        val aArr = FloatArray(w * h)
        val bArr = FloatArray(w * h)
        for (i in pixels.indices) {
            val r = Color.red(pixels[i])
            val g = Color.green(pixels[i])
            val bl = Color.blue(pixels[i])
            val lab = rgbToLab(r, g, bl)
            lArr[i] = lab[0]
            aArr[i] = lab[1]
            bArr[i] = lab[2]
        }

        val cl = applyClahe(lArr, w, h, 3.0f, 8)

        val result = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val outPixels = IntArray(w * h)
        for (i in outPixels.indices) {
            outPixels[i] = labToRgb(cl[i], aArr[i], bArr[i])
        }
        result.setPixels(outPixels, 0, w, 0, 0, w, h)
        return result
    }

    fun rotateImage(image: Bitmap, angle: Float): Bitmap {
        val cx = image.width / 2f
        val cy = image.height / 2f
        val m = Matrix()
        m.postRotate(angle, cx, cy)
        val result = Bitmap.createBitmap(image.width, image.height, image.config ?: Bitmap.Config.ARGB_8888)
        val canvas = Canvas(result)
        canvas.drawBitmap(image, m, Paint(Paint.FILTER_BITMAP_FLAG))
        return result
    }

    fun computeSkew(srcImg: Bitmap, centerThres: Int): Float {
        val w = srcImg.width
        val h = srcImg.height

        val pixels = IntArray(w * h)
        srcImg.getPixels(pixels, 0, w, 0, 0, w, h)

        val gray = FloatArray(w * h)
        for (i in pixels.indices) {
            gray[i] = (Color.red(pixels[i]) * 0.299f + Color.green(pixels[i]) * 0.587f + Color.blue(pixels[i]) * 0.114f)
        }

        val blurred = medianBlur(gray, w, h, 3)
        val edges = canny(blurred, w, h, 30f, 100f)
        val lines = houghLinesP(edges, w, h, 1f, PI.toFloat() / 180f, 30, w / 1.5f, h / 3.0f)

        if (lines.isEmpty()) return 1f

        var minLine = 100f
        var minLinePos = 0
        for (i in lines.indices) {
            val x1 = lines[i][0]; val y1 = lines[i][1]
            val x2 = lines[i][2]; val y2 = lines[i][3]
            val centerY = (y1 + y2) / 2f
            if (centerThres == 1) {
                if (centerY < 7f) continue
            }
            if (centerY < minLine) {
                minLine = centerY
                minLinePos = i
            }
        }

        var angle = 0.0
        var cnt = 0
        val x1 = lines[minLinePos][0]; val y1 = lines[minLinePos][1]
        val x2 = lines[minLinePos][2]; val y2 = lines[minLinePos][3]
        val ang = atan2((y2 - y1).toDouble(), (x2 - x1).toDouble())
        if (abs(ang) <= 30.0) {
            angle += ang
            cnt++
        }
        if (cnt == 0) return 0.0f
        return ((angle / cnt) * 180.0 / PI).toFloat()
    }

    fun deskew(srcImg: Bitmap, changeCons: Int, centerThres: Int): Bitmap {
        return if (changeCons == 1) {
            rotateImage(srcImg, computeSkew(changeContrast(srcImg), centerThres))
        } else {
            rotateImage(srcImg, computeSkew(srcImg, centerThres))
        }
    }

    private fun linearEquation(x1: Float, y1: Float, x2: Float, y2: Float): Pair<Float, Float> {
        val b = y1 - (y2 - y1) * x1 / (x2 - x1)
        val a = (y1 - b) / x1
        return Pair(a, b)
    }

    private fun checkPointLinear(x: Float, y: Float, x1: Float, y1: Float, x2: Float, y2: Float): Boolean {
        val (a, b) = linearEquation(x1, y1, x2, y2)
        val yPred = a * x + b
        return abs(yPred - y) <= 3f
    }

    val LPR_CHAR_MAP = arrayOf(
        "1", "2", "3", "4", "5", "6", "7", "8", "9",
        "A", "B", "C", "D", "E", "F", "G", "H", "K",
        "L", "M", "N", "P", "S", "T", "U", "V", "X", "Y", "Z",
        "0"
    )

    fun readPlate(chars: List<Detection>): String {
        if (chars.isEmpty() || chars.size < 7 || chars.size > 10) return "unknown"

        val centerList = mutableListOf<Triple<Float, Float, Int>>()
        for (bb in chars) {
            val xC = (bb.x1 + bb.x2) / 2f
            val yC = (bb.y1 + bb.y2) / 2f
            centerList.add(Triple(xC, yC, bb.cls))
        }

        var lPoint = centerList[0]
        var rPoint = centerList[0]
        for (cp in centerList) {
            if (cp.first < lPoint.first) lPoint = cp
            if (cp.first > rPoint.first) rPoint = cp
        }

        var lpType = "1"
        for (ct in centerList) {
            if (lPoint.first != rPoint.first) {
                if (!checkPointLinear(ct.first, ct.second, lPoint.first, lPoint.second, rPoint.first, rPoint.second)) {
                    lpType = "2"
                }
            }
        }

        val ySum = centerList.sumOf { it.second.toDouble() }.toFloat()
        val yMean = ySum.toInt() / centerList.size

        val line1 = mutableListOf<Triple<Float, Float, Int>>()
        val line2 = mutableListOf<Triple<Float, Float, Int>>()
        val licensePlate = StringBuilder()

        if (lpType == "2") {
            for (c in centerList) {
                if (c.second.toInt() > yMean) {
                    line2.add(c)
                } else {
                    line1.add(c)
                }
            }
            for (l1 in line1.sortedBy { it.first }) {
                licensePlate.append(LPR_CHAR_MAP[l1.third])
            }
            for (l2 in line2.sortedBy { it.first }) {
                licensePlate.append(LPR_CHAR_MAP[l2.third])
            }
        } else {
            for (l in centerList.sortedBy { it.first }) {
                licensePlate.append(LPR_CHAR_MAP[l.third])
            }
        }
        return licensePlate.toString()
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

    private fun rgbToLab(r: Int, g: Int, b: Int): FloatArray {
        val rr = r / 255f
        val gg = g / 255f
        val bb = b / 255f

        val rLin = if (rr > 0.04045f) ((rr + 0.055f) / 1.055f).pow(2.4f) else rr / 12.92f
        val gLin = if (gg > 0.04045f) ((gg + 0.055f) / 1.055f).pow(2.4f) else gg / 12.92f
        val bLin = if (bb > 0.04045f) ((bb + 0.055f) / 1.055f).pow(2.4f) else bb / 12.92f

        val x = 0.4124564f * rLin + 0.3575761f * gLin + 0.1804375f * bLin
        val y = 0.2126729f * rLin + 0.7151522f * gLin + 0.0721750f * bLin
        val z = 0.0193339f * rLin + 0.1191920f * gLin + 0.9503041f * bLin

        val xn = 0.950456f
        val yn = 1.0f
        val zn = 1.088754f

        val fx = labF(x / xn)
        val fy = labF(y / yn)
        val fz = labF(z / zn)

        val L = (116f * fy - 16f).coerceIn(0f, 100f)
        val A = 500f * (fx - fy)
        val B = 200f * (fy - fz)
        return floatArrayOf(L, A, B)
    }

    private fun labF(t: Float): Float {
        return if (t > 0.008856f) t.pow(1f / 3f) else 7.787f * t + 16f / 116f
    }

    private fun labToRgb(L: Float, A: Float, B: Float): Int {
        val fy = (L + 16f) / 116f
        val fx = A / 500f + fy
        val fz = fy - B / 200f

        val xn = 0.950456f
        val yn = 1.0f
        val zn = 1.088754f

        val x = xn * labFInv(fx)
        val y = yn * labFInv(fy)
        val z = zn * labFInv(fz)

        val rLin = 3.2404542f * x - 1.5371385f * y - 0.4985314f * z
        val gLin = -0.9692660f * x + 1.8760108f * y + 0.0415560f * z
        val bLin = 0.0556434f * x - 0.2040259f * y + 1.0572252f * z

        val rr = if (rLin > 0.0031308f) 1.055f * rLin.pow(1f / 2.4f) - 0.055f else 12.92f * rLin
        val gg = if (gLin > 0.0031308f) 1.055f * gLin.pow(1f / 2.4f) - 0.055f else 12.92f * gLin
        val bb = if (bLin > 0.0031308f) 1.055f * bLin.pow(1f / 2.4f) - 0.055f else 12.92f * bLin

        val r = (rr * 255f).toInt().coerceIn(0, 255)
        val g = (gg * 255f).toInt().coerceIn(0, 255)
        val bl = (bb * 255f).toInt().coerceIn(0, 255)
        return Color.rgb(r, g, bl)
    }

    private fun labFInv(t: Float): Float {
        return if (t > 0.206893f) t * t * t else (t - 16f / 116f) / 7.787f
    }

    private fun applyClahe(channel: FloatArray, width: Int, height: Int, clipLimit: Float, tileGridSize: Int): FloatArray {
        val tilesX = ceil(width.toFloat() / tileGridSize).toInt()
        val tilesY = ceil(height.toFloat() / tileGridSize).toInt()
        val actualTileW = ceil(width.toFloat() / tilesX).toInt()
        val actualTileH = ceil(height.toFloat() / tilesY).toInt()

        val tileHist = Array(tilesY) { Array(tilesX) { IntArray(256) } }
        for (ty in 0 until tilesY) {
            for (tx in 0 until tilesX) {
                val xStart = tx * actualTileW
                val yStart = ty * actualTileH
                val xEnd = min(xStart + actualTileW, width)
                val yEnd = min(yStart + actualTileH, height)

                for (y in yStart until yEnd) {
                    for (x in xStart until xEnd) {
                        val idx = (channel[y * width + x] * 2.55f).toInt().coerceIn(0, 255)
                        tileHist[ty][tx][idx]++
                    }
                }

                val totalPixels = (xEnd - xStart) * (yEnd - yStart)
                val clipValue = (clipLimit * totalPixels / 256).toInt().coerceAtLeast(1)
                var clipped = 0
                for (i in 0 until 256) {
                    if (tileHist[ty][tx][i] > clipValue) {
                        clipped += tileHist[ty][tx][i] - clipValue
                        tileHist[ty][tx][i] = clipValue
                    }
                }
                val redist = clipped / 256
                for (i in 0 until 256) {
                    tileHist[ty][tx][i] += redist
                }
            }
        }

        val tileCdf = Array(tilesY) { Array(tilesX) { FloatArray(256) } }
        for (ty in 0 until tilesY) {
            for (tx in 0 until tilesX) {
                var sum = 0
                for (i in 0 until 256) {
                    sum += tileHist[ty][tx][i]
                    tileCdf[ty][tx][i] = sum.toFloat()
                }
                val total = sum.toFloat()
                if (total > 0f) {
                    for (i in 0 until 256) {
                        tileCdf[ty][tx][i] /= total
                    }
                }
            }
        }

        val result = FloatArray(width * height)
        for (y in 0 until height) {
            for (x in 0 until width) {
                val idx = (channel[y * width + x] * 2.55f).toInt().coerceIn(0, 255)

                val tx = ((x * tilesX) / width).coerceIn(0, tilesX - 1)
                val ty = ((y * tilesY) / height).coerceIn(0, tilesY - 1)

                val tx0 = maxOf(0, tx - 1)
                val tx1 = minOf(tilesX - 1, tx + 1)
                val ty0 = maxOf(0, ty - 1)
                val ty1 = minOf(tilesY - 1, ty + 1)

                val v00 = tileCdf[ty0][tx0][idx]
                val v01 = tileCdf[ty0][tx1][idx]
                val v10 = tileCdf[ty1][tx0][idx]
                val v11 = tileCdf[ty1][tx1][idx]

                val wx = ((x - (tx0 + 0.5f) * width / tilesX) / ((tx1 - tx0) * width / tilesX))
                val wy = ((y - (ty0 + 0.5f) * height / tilesY) / ((ty1 - ty0) * height / tilesY))

                val lx = wx.coerceIn(0f, 1f)
                val ly = wy.coerceIn(0f, 1f)

                val interpVal = v00 * (1f - lx) * (1f - ly) +
                    v01 * lx * (1f - ly) +
                    v10 * (1f - lx) * ly +
                    v11 * lx * ly

                result[y * width + x] = interpVal.coerceIn(0f, 1f)
            }
        }
        return result
    }

    private fun medianBlur(src: FloatArray, width: Int, height: Int, ksize: Int): FloatArray {
        val result = FloatArray(width * height)
        val half = ksize / 2
        val kernel = FloatArray(ksize * ksize)
        for (y in 0 until height) {
            for (x in 0 until width) {
                var count = 0
                for (ky in -half..half) {
                    for (kx in -half..half) {
                        val px = (x + kx).coerceIn(0, width - 1)
                        val py = (y + ky).coerceIn(0, height - 1)
                        kernel[count++] = src[py * width + px]
                    }
                }
                kernel.sort(0, count)
                result[y * width + x] = kernel[count / 2]
            }
        }
        return result
    }

    private fun canny(src: FloatArray, width: Int, height: Int, lowThresh: Float, highThresh: Float): BooleanArray {
        val gx = FloatArray(width * height)
        val gy = FloatArray(width * height)
        val mag = FloatArray(width * height)

        for (y in 1 until height - 1) {
            for (x in 1 until width - 1) {
                val idx = y * width + x
                gx[idx] = -src[idx - width - 1] - 2f * src[idx - 1] - src[idx + width - 1]
                    + src[idx - width + 1] + 2f * src[idx + 1] + src[idx + width + 1]
                gy[idx] = -src[idx - width - 1] - 2f * src[idx - width] - src[idx - width + 1]
                    + src[idx + width - 1] + 2f * src[idx + width] + src[idx + width + 1]
                mag[idx] = sqrt(gx[idx] * gx[idx] + gy[idx] * gy[idx])
            }
        }

        val nms = FloatArray(width * height)
        for (y in 1 until height - 1) {
            for (x in 1 until width - 1) {
                val idx = y * width + x
                val angle = atan2(gy[idx].toDouble(), gx[idx].toDouble())
                val ang = ((angle * 180.0 / PI + 180.0) % 180.0).toFloat()
                var neighbor1 = 0f
                var neighbor2 = 0f
                when {
                    ang < 22.5f || ang >= 157.5f -> {
                        neighbor1 = mag[y * width + x - 1]
                        neighbor2 = mag[y * width + x + 1]
                    }
                    ang < 67.5f -> {
                        neighbor1 = mag[(y - 1) * width + x + 1]
                        neighbor2 = mag[(y + 1) * width + x - 1]
                    }
                    ang < 112.5f -> {
                        neighbor1 = mag[(y - 1) * width + x]
                        neighbor2 = mag[(y + 1) * width + x]
                    }
                    else -> {
                        neighbor1 = mag[(y - 1) * width + x - 1]
                        neighbor2 = mag[(y + 1) * width + x + 1]
                    }
                }
                nms[idx] = if (mag[idx] >= neighbor1 && mag[idx] >= neighbor2) mag[idx] else 0f
            }
        }

        val edges = BooleanArray(width * height)
        val strong = Float.MAX_VALUE
        val weak = -1f
        val edgeMap = FloatArray(width * height)

        for (i in nms.indices) {
            edgeMap[i] = when {
                nms[i] >= highThresh -> strong
                nms[i] >= lowThresh -> weak
                else -> 0f
            }
        }

        val queue = ArrayDeque<Int>()
        for (i in edgeMap.indices) {
            if (edgeMap[i] == strong) {
                queue.addLast(i)
                edges[i] = true
            }
        }

        while (queue.isNotEmpty()) {
            val pos = queue.removeFirst()
            val px = pos % width
            val py = pos / width
            for (dy in -1..1) {
                for (dx in -1..1) {
                    if (dx == 0 && dy == 0) continue
                    val nx = px + dx
                    val ny = py + dy
                    if (nx in 0 until width && ny in 0 until height) {
                        val ni = ny * width + nx
                        if (edgeMap[ni] == weak && !edges[ni]) {
                            edges[ni] = true
                            queue.addLast(ni)
                        }
                    }
                }
            }
        }

        return edges
    }

    private fun houghLinesP(edges: BooleanArray, width: Int, height: Int, rho: Float, theta: Float, threshold: Int, minLineLength: Float, maxLineGap: Float): List<FloatArray> {
        val thetaSteps = (PI / theta).toInt()
        val rhoMax = sqrt((width * width + height * height).toDouble()).toInt()
        val rhoSteps = 2 * rhoMax + 1
        val accum = Array(rhoSteps) { IntArray(thetaSteps) }

        val edgePoints = mutableListOf<Pair<Int, Int>>()
        for (y in 0 until height) {
            for (x in 0 until width) {
                if (edges[y * width + x]) {
                    edgePoints.add(Pair(x, y))
                }
            }
        }

        if (edgePoints.isEmpty()) return emptyList()

        for ((x, y) in edgePoints) {
            for (t in 0 until thetaSteps) {
                val th = t * theta
                val r = (x * cos(th.toDouble()) + y * sin(th.toDouble())).toInt() + rhoMax
                if (r in 0 until rhoSteps) {
                    accum[r][t]++
                }
            }
        }

        val lines = mutableListOf<FloatArray>()
        for (r in 0 until rhoSteps) {
            for (t in 0 until thetaSteps) {
                if (accum[r][t] < threshold) continue
                val th = t * theta
                val cosT = cos(th.toDouble())
                val sinT = sin(th.toDouble())

                val projList = mutableListOf<Pair<Double, Int>>()
                for (pIdx in edgePoints.indices) {
                    val (x, y) = edgePoints[pIdx]
                    val rt = (x * cosT + y * sinT).toInt() + rhoMax
                    if (rt == r) {
                        projList.add(Pair(x * cosT + y * sinT, pIdx))
                    }
                }

                if (projList.size < 2) continue

                projList.sortBy { it.first }
                val lineLen = projList.last().first - projList.first().first
                if (lineLen < minLineLength) continue

                val firstPt = edgePoints[projList.first().second]
                val lastPt = edgePoints[projList.last().second]
                lines.add(floatArrayOf(
                    firstPt.first.toFloat(), firstPt.second.toFloat(),
                    lastPt.first.toFloat(), lastPt.second.toFloat()
                ))
            }
        }
        return lines
    }
}
