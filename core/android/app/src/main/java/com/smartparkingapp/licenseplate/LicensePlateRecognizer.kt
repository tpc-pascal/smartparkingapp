package com.smartparkingapp.licenseplate

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import android.media.Image
import android.util.Log
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.FloatBuffer
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession

class LicensePlateRecognizer(private val context: Context) {

    companion object {
        private const val TAG = "LPR_Recognizer"
    }

    private var ortEnv: OrtEnvironment
    private var lpdSession: OrtSession? = null
    private var lprSession: OrtSession? = null

    private val inputSize = 640
    private val lpdConfThreshold = 0.5f
    private val lpdNmsThreshold = 0.4f
    private val lprConfThreshold = 0.3f

    data class Detection(val x1: Int, val y1: Int, val x2: Int, val y2: Int, val confidence: Float, val classId: Int)
    data class CharResult(val x1: Float, val y1: Float, val x2: Float, val y2: Float, val char: String)
    data class RecognitionResult(val plate: String, val success: Boolean, val error: String? = null)

    init {
        Log.d(TAG, "Initializing recognizer...")
        ortEnv = OrtEnvironment.getEnvironment()
        loadModels()
    }

    private fun loadModels() {
        try {
            Log.d(TAG, "Loading LPD model...")
            val startTime = System.currentTimeMillis()
            val lpdModel = loadModelBytes("LPD_best_weight.onnx")
            Log.d(TAG, "LPD model loaded: ${lpdModel.size} bytes in ${System.currentTimeMillis() - startTime}ms")
            lpdSession = ortEnv.createSession(lpdModel, OrtSession.SessionOptions())
            Log.d(TAG, "LPD session created, inputs=${lpdSession?.inputNames}, outputs=${lpdSession?.outputNames}")

            Log.d(TAG, "Loading LPR model...")
            val startTime2 = System.currentTimeMillis()
            val lprModel = loadModelBytes("LPR_best_weight.onnx")
            Log.d(TAG, "LPR model loaded: ${lprModel.size} bytes in ${System.currentTimeMillis() - startTime2}ms")
            lprSession = ortEnv.createSession(lprModel, OrtSession.SessionOptions())
            Log.d(TAG, "LPR session created, inputs=${lprSession?.inputNames}, outputs=${lprSession?.outputNames}")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load models: ${e.message}", e)
        }
    }

    private fun loadModelBytes(filename: String): ByteArray {
        return context.assets.open(filename).use { it.readBytes() }
    }

    fun recognizePlate(bitmap: Bitmap): RecognitionResult {
        Log.d(TAG, "recognizePlate: bitmap ${bitmap.width}x${bitmap.height}, config=${bitmap.config}")
        try {
            val startTime = System.currentTimeMillis()
            val plateBitmap = detectPlate(bitmap)
            Log.d(TAG, "detectPlate result: ${plateBitmap?.width}x${plateBitmap?.height}, took ${System.currentTimeMillis() - startTime}ms")
            if (plateBitmap == null) {
                Log.w(TAG, "No plate detected in image")
                return RecognitionResult("", false, "No plate detected")
            }

            Log.d(TAG, "Running deskew on ${plateBitmap.width}x${plateBitmap.height} plate crop...")
            val deskewed = ImageProcessor.deskew(plateBitmap, changeCons = true, centerThres = 1)
            Log.d(TAG, "Deskew result: ${deskewed.width}x${deskewed.height}")

            Log.d(TAG, "Reading plate characters...")
            val plateText = readPlate(deskewed)
            val success = plateText.isNotEmpty() && plateText != "unknown"
            Log.d(TAG, "Final plate text: '$plateText', success=$success")
            return RecognitionResult(plateText, success, null)
        } catch (e: Exception) {
            Log.e(TAG, "recognizePlate exception: ${e.message}", e)
            return RecognitionResult("", false, e.message)
        }
    }

    private fun detectPlate(bitmap: Bitmap): Bitmap? {
        val session = lpdSession
        if (session == null) {
            Log.e(TAG, "LPD session is null, model not loaded")
            return null
        }

        Log.d(TAG, "LPD detectPlate: input ${bitmap.width}x${bitmap.height}")
        val resized = Bitmap.createScaledBitmap(bitmap, inputSize, inputSize, true)
        Log.d(TAG, "Resized to ${inputSize}x${inputSize}")
        val inputTensor = bitmapToFloatBuffer(resized)

        val inputName = session.inputNames.iterator().next()
        Log.d(TAG, "LPD input name: $inputName")
        val inputOnnx = OnnxTensor.createTensor(ortEnv, inputTensor, longArrayOf(1, 3, inputSize.toLong(), inputSize.toLong()))

        Log.d(TAG, "Running LPD inference...")
        val inferStart = System.currentTimeMillis()
        val output = session.run(mapOf(inputName to inputOnnx))
        Log.d(TAG, "LPD inference done in ${System.currentTimeMillis() - inferStart}ms")

        val detections = parseYoloOutput(output)

        inputOnnx.close()

        Log.d(TAG, "LPD raw detections: ${detections.size}")
        if (detections.isEmpty()) {
            Log.w(TAG, "No LPD detections after NMS")
            return null
        }

        val best = detections.maxByOrNull { it.confidence }!!
        Log.d(TAG, "Best detection: [${best.x1},${best.y1},${best.x2},${best.y2}] conf=${best.confidence} class=${best.classId}")

        val scaleX = bitmap.width.toFloat() / inputSize
        val scaleY = bitmap.height.toFloat() / inputSize
        val x1 = (best.x1 * scaleX).toInt().coerceIn(0, bitmap.width - 1)
        val y1 = (best.y1 * scaleY).toInt().coerceIn(0, bitmap.height - 1)
        val x2 = (best.x2 * scaleX).toInt().coerceIn(0, bitmap.width - 1)
        val y2 = (best.y2 * scaleY).toInt().coerceIn(0, bitmap.height - 1)
        Log.d(TAG, "Scaled to original: [$x1,$y1,$x2,$y2] (orig ${bitmap.width}x${bitmap.height})")

        val w = (x2 - x1).coerceAtLeast(1)
        val h = (y2 - y1).coerceAtLeast(1)
        val crop = Bitmap.createBitmap(bitmap, x1, y1, w, h)
        Log.d(TAG, "Plate crop: ${crop.width}x${crop.height}")
        return crop
    }

    private fun readPlate(bitmap: Bitmap): String {
        val session = lprSession
        if (session == null) {
            Log.e(TAG, "LPR session is null, model not loaded")
            return "unknown"
        }

        Log.d(TAG, "LPR readPlate: input ${bitmap.width}x${bitmap.height}")
        val resized = Bitmap.createScaledBitmap(bitmap, inputSize, inputSize, true)
        val inputTensor = bitmapToFloatBuffer(resized)

        val inputName = session.inputNames.iterator().next()
        Log.d(TAG, "LPR input name: $inputName")
        val inputOnnx = OnnxTensor.createTensor(ortEnv, inputTensor, longArrayOf(1, 3, inputSize.toLong(), inputSize.toLong()))

        Log.d(TAG, "Running LPR inference...")
        val inferStart = System.currentTimeMillis()
        val output = session.run(mapOf(inputName to inputOnnx))
        Log.d(TAG, "LPR inference done in ${System.currentTimeMillis() - inferStart}ms")

        val chars = parseLprOutput(output)

        inputOnnx.close()

        Log.d(TAG, "LPR raw chars: ${chars.size}")
        if (chars.isNotEmpty()) {
            chars.forEachIndexed { i, c -> Log.d(TAG, "  char[$i]: '${c.char}' at [${c.x1},${c.y1},${c.x2},${c.y2}]") }
        }

        return reconstructPlateString(chars)
    }

    private fun bitmapToFloatBuffer(bitmap: Bitmap): FloatBuffer {
        val pixels = IntArray(inputSize * inputSize)
        bitmap.getPixels(pixels, 0, inputSize, 0, 0, inputSize, inputSize)

        val buffer = FloatBuffer.allocate(3 * inputSize * inputSize)

        for (pixel in pixels) {
            val r = ((pixel shr 16) and 0xFF) / 255.0f
            buffer.put(r)
        }
        for (pixel in pixels) {
            val g = ((pixel shr 8) and 0xFF) / 255.0f
            buffer.put(g)
        }
        for (pixel in pixels) {
            val b = (pixel and 0xFF) / 255.0f
            buffer.put(b)
        }
        buffer.rewind()
        return buffer
    }

    private fun parseYoloOutput(output: OrtSession.Result): List<Detection> {
        val detections = mutableListOf<Detection>()
        val session = lpdSession ?: return detections

        for (name in session.outputNames) {
            val opt = output.get(name) ?: continue
            try {
                val tensor = opt.get() as OnnxTensor
                val floatBuffer = tensor.floatBuffer
                val tensorInfo = tensor.info
                val shape = tensorInfo.shape
                if (shape.size < 2) {
                    Log.w(TAG, "LPD output '$name' shape has < 2 dims: ${shape.joinToString()}")
                    continue
                }

                val outerDim = shape[0].toInt()
                val innerDim = shape[1].toInt()
                Log.d(TAG, "LPD output '$name': shape ${shape.joinToString()}, outer=$outerDim, inner=$innerDim")
                floatBuffer.rewind()

                var totalRows = 0
                var keptRows = 0
                for (i in 0 until outerDim) {
                    val row = FloatArray(innerDim)
                    floatBuffer.get(row)
                    totalRows++
                    val det = parseYoloRow(row)
                    if (det != null) {
                        detections.add(det)
                        keptRows++
                    }
                }
                Log.d(TAG, "LPD parseYoloOutput: $totalRows rows scanned, $keptRows kept")
            } catch (e: Exception) {
                Log.w(TAG, "Failed to parse output '$name': ${e.message}")
                continue
            }
        }

        val nmsResult = nonMaxSuppression(detections, lpdNmsThreshold)
        Log.d(TAG, "LPD after NMS: ${nmsResult.size} detections (from ${detections.size})")
        return nmsResult
    }

    private fun parseYoloRow(row: FloatArray): Detection? {
        if (row.size < 6) return null
        val cx = row[0]
        val cy = row[1]
        val w = row[2]
        val h = row[3]
        val objConf = row[4]
        if (objConf < lpdConfThreshold) return null

        var bestClass = 0
        var bestClassScore = 0f
        for (i in 5 until row.size) {
            if (row[i] > bestClassScore) {
                bestClassScore = row[i]
                bestClass = i - 5
            }
        }
        val confidence = objConf * bestClassScore
        if (confidence < lpdConfThreshold) return null

        val x1 = (cx - w / 2).toInt()
        val y1 = (cy - h / 2).toInt()
        val x2 = (cx + w / 2).toInt()
        val y2 = (cy + h / 2).toInt()

        return Detection(x1, y1, x2, y2, confidence, bestClass)
    }

    private fun parseLprOutput(output: OrtSession.Result): List<CharResult> {
        val chars = mutableListOf<CharResult>()
        val session = lprSession ?: return chars

        for (name in session.outputNames) {
            val opt = output.get(name) ?: continue
            try {
                val tensor = opt.get() as OnnxTensor
                val floatBuffer = tensor.floatBuffer
                val tensorInfo = tensor.info
                val shape = tensorInfo.shape
                if (shape.size < 2) {
                    Log.w(TAG, "LPR output '$name' shape has < 2 dims: ${shape.joinToString()}")
                    continue
                }

                val outerDim = shape[0].toInt()
                val innerDim = shape[1].toInt()
                Log.d(TAG, "LPR output '$name': shape ${shape.joinToString()}, outer=$outerDim, inner=$innerDim")
                floatBuffer.rewind()

                var totalRows = 0
                var keptRows = 0
                for (i in 0 until outerDim) {
                    val row = FloatArray(innerDim)
                    floatBuffer.get(row)
                    totalRows++
                    val det = parseLprRow(row)
                    if (det != null) {
                        chars.add(det)
                        keptRows++
                    }
                }
                Log.d(TAG, "LPR parseLprOutput: $totalRows rows scanned, $keptRows kept")
            } catch (e: Exception) {
                Log.w(TAG, "Failed to parse LPR output '$name': ${e.message}")
                continue
            }
        }

        val nmsResult = nonMaxSuppressionChars(chars, 0.4f)
        Log.d(TAG, "LPR after NMS: ${nmsResult.size} chars (from ${chars.size})")
        return nmsResult
    }

    private fun parseLprRow(row: FloatArray): CharResult? {
        if (row.size < 6) return null
        val cx = row[0]
        val cy = row[1]
        val w = row[2]
        val h = row[3]
        val objConf = row[4]
        if (objConf < lprConfThreshold) return null

        var bestClass = 0
        var bestClassScore = 0f
        for (i in 5 until row.size) {
            if (row[i] > bestClassScore) {
                bestClassScore = row[i]
                bestClass = i - 5
            }
        }
        val confidence = objConf * bestClassScore
        if (confidence < lprConfThreshold) return null

        return CharResult(
            cx - w / 2, cy - h / 2,
            cx + w / 2, cy + h / 2,
            charClassToLabel(bestClass)
        )
    }

    private fun nonMaxSuppression(detections: List<Detection>, threshold: Float): List<Detection> {
        val sorted = detections.sortedByDescending { it.confidence }
        val result = mutableListOf<Detection>()

        for (det in sorted) {
            var suppressed = false
            for (res in result) {
                if (iou(det, res) > threshold) {
                    suppressed = true
                    break
                }
            }
            if (!suppressed) result.add(det)
        }
        return result
    }

    private fun nonMaxSuppressionChars(chars: List<CharResult>, threshold: Float): List<CharResult> {
        val sorted = chars.sortedByDescending { (it.x2 - it.x1) * (it.y2 - it.y1) }
        val result = mutableListOf<CharResult>()

        for (ch in sorted) {
            var suppressed = false
            for (res in result) {
                if (iouChar(ch, res) > threshold) {
                    suppressed = true
                    break
                }
            }
            if (!suppressed) result.add(ch)
        }
        return result
    }

    private fun iou(a: Detection, b: Detection): Float {
        val x1 = maxOf(a.x1, b.x1)
        val y1 = maxOf(a.y1, b.y1)
        val x2 = minOf(a.x2, b.x2)
        val y2 = minOf(a.y2, b.y2)
        if (x2 <= x1 || y2 <= y1) return 0f

        val intersection = ((x2 - x1) * (y2 - y1)).toFloat()
        val areaA = ((a.x2 - a.x1) * (a.y2 - a.y1)).toFloat()
        val areaB = ((b.x2 - b.x1) * (b.y2 - b.y1)).toFloat()
        return intersection / (areaA + areaB - intersection)
    }

    private fun iouChar(a: CharResult, b: CharResult): Float {
        val x1 = maxOf(a.x1, b.x1)
        val y1 = maxOf(a.y1, b.y1)
        val x2 = minOf(a.x2, b.x2)
        val y2 = minOf(a.y2, b.y2)
        if (x2 <= x1 || y2 <= y1) return 0f

        val intersection = ((x2 - x1) * (y2 - y1))
        val areaA = ((a.x2 - a.x1) * (a.y2 - a.y1))
        val areaB = ((b.x2 - b.x1) * (b.y2 - b.y1))
        return intersection / (areaA + areaB - intersection)
    }

    private fun reconstructPlateString(chars: List<CharResult>): String {
        Log.d(TAG, "reconstructPlateString: ${chars.size} chars")
        if (chars.size < 7 || chars.size > 10) {
            Log.w(TAG, "Char count ${chars.size} outside valid range [7-10], returning 'unknown'")
            return "unknown"
        }

        val centers = chars.map { (it.x1 + it.x2) / 2f to (it.y1 + it.y2) / 2f }
        val yMean = centers.map { it.second }.average()

        val line1 = mutableListOf<Pair<Float, String>>()
        val line2 = mutableListOf<Pair<Float, String>>()

        for ((i, ch) in chars.withIndex()) {
            val cy = centers[i].second
            if (cy > yMean) {
                line2.add(centers[i].first to ch.char)
            } else {
                line1.add(centers[i].first to ch.char)
            }
        }

        val result = if (line2.isNotEmpty()) {
            val top = line1.sortedBy { it.first }.map { it.second }.joinToString("")
            val bottom = line2.sortedBy { it.first }.map { it.second }.joinToString("")
            "$top-$bottom"
        } else {
            chars.sortedBy { (it.x1 + it.x2) / 2f }.map { it.char }.joinToString("")
        }
        Log.d(TAG, "Reconstructed plate: '$result' (line1=${line1.size}, line2=${line2.size})")
        return result
    }

    private fun charClassToLabel(classId: Int): String {
        val characters = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        return if (classId in characters.indices) characters[classId].toString() else "?"
    }

    fun close() {
        lpdSession?.close()
        lprSession?.close()
    }
}
