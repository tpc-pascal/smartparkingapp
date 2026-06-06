package com.smartparkingapp

import android.graphics.BitmapFactory
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.FilenameFilter
import java.nio.FloatBuffer
import kotlin.math.max
import kotlin.random.Random

@RunWith(AndroidJUnit4::class)
class LprBenchmarkTest {

    private val ortEnv by lazy { OrtEnvironment.getEnvironment() }
    private var lpdSession: OrtSession? = null
    private var lprSession: OrtSession? = null

    @Before
    fun setUp() {
        loadSessions()
    }

    @After
    fun tearDown() {
        lpdSession?.close()
        lprSession?.close()
    }

    private fun loadSessions() {
        val targetContext = InstrumentationRegistry.getInstrumentation().targetContext
        val lpdPath = assetFilePath(targetContext, "LP_detector.onnx")
        val lprPath = assetFilePath(targetContext, "LP_ocr.onnx")
        val opts = OrtSession.SessionOptions()
        opts.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
        opts.setIntraOpNumThreads(4)
        opts.setMemoryPatternOptimization(true)
        try { opts.javaClass.getMethod("addNnapi").invoke(opts) } catch (_: Exception) {}
        try { opts.javaClass.getMethod("addXnnpack").invoke(opts) } catch (_: Exception) {}
        lpdSession = ortEnv.createSession(lpdPath, opts)
        lprSession = ortEnv.createSession(lprPath, opts)
    }

    private fun assetFilePath(context: android.content.Context, name: String): String {
        val file = File(context.filesDir, name)
        if (file.exists() && file.length() > 1000000) return file.absolutePath
        context.assets.open(name).use { input ->
            FileOutputStream(file).use { output -> input.copyTo(output) }
        }
        return file.absolutePath
    }

    @Test
    fun benchmarkOnRandom10() = runBlocking {
        val targetContext = InstrumentationRegistry.getInstrumentation().targetContext
        val testDir = File(targetContext.filesDir, "lpr_test")
        val resultsFile = File(targetContext.filesDir, "lpr_test_results.json")

        if (!testDir.exists() || !testDir.isDirectory) {
            val err = JSONObject()
            err.put("error", "Test dir not found: ${testDir.absolutePath}")
            resultsFile.writeText(err.toString(2))
            throw IllegalStateException("Test images directory not found: ${testDir.absolutePath}")
        }

        val allImages = testDir.listFiles(FilenameFilter { _, name ->
            name.endsWith(".jpg") || name.endsWith(".png") || name.endsWith(".jpeg")
        })?.toList() ?: emptyList()

        if (allImages.isEmpty()) {
            val err = JSONObject()
            err.put("error", "No images in ${testDir.absolutePath}")
            resultsFile.writeText(err.toString(2))
            throw IllegalStateException("No images found in $testDir")
        }

        val selected = allImages.shuffled(Random).take(10.coerceAtMost(allImages.size))
        val results = JSONArray()

        for (imageFile in selected) {
            runCatching {
                processImage(imageFile, results)
            }.onFailure { e ->
                val r = JSONObject()
                r.put("file", imageFile.name)
                r.put("plate", "error")
                r.put("confidence", 0.0)
                r.put("latencyMs", -1)
                r.put("error", e.message ?: "unknown error")
                results.put(r)
            }
        }

        val total = JSONObject()
        total.put("results", results)
        total.put("totalImages", results.length())
        val passed = (0 until results.length()).count { i ->
            results.getJSONObject(i).optString("plate", "error") != "error" &&
            results.getJSONObject(i).optString("plate", "unknown") != "unknown"
        }
        total.put("passed", passed)
        total.put("accuracy", if (results.length() > 0) "%.0f".format(100.0 * passed / results.length()) else "0")
        val latencies = (0 until results.length()).mapNotNull { i ->
            val l = results.getJSONObject(i).optLong("latencyMs", -1)
            if (l > 0) l else null
        }
        total.put("avgLatencyMs", if (latencies.isNotEmpty()) "%.0f".format(latencies.average()) else "N/A")

        resultsFile.writeText(total.toString(2))
    }

    private fun processImage(imageFile: File, results: JSONArray) {
        val startTime = System.currentTimeMillis()
        val r = JSONObject()
        r.put("file", imageFile.name)

        val opts = BitmapFactory.Options()
        val bmp = BitmapFactory.decodeFile(imageFile.absolutePath, opts)
            ?: throw IllegalStateException("Cannot decode ${imageFile.absolutePath}")

        try {
            val origW = bmp.width; val origH = bmp.height
            r.put("imageWidth", origW)
            r.put("imageHeight", origH)

            // Step 1: LPD
            val lpdResult = ImageProcessor.letterbox(bmp, 640)
            val lpdInput = ImageProcessor.bitmapToFloatArray(lpdResult.bitmap)
            val lpdInputTensor = OnnxTensor.createTensor(ortEnv,
                FloatBuffer.wrap(lpdInput),
                longArrayOf(1, 3, 640, 640)
            )
            val lpdOutput = lpdSession!!.run(mapOf("input" to lpdInputTensor))
            lpdInputTensor.close()
            val lpdRaw = (lpdOutput.get("output").get().value as Array<*>)[0] as Array<FloatArray>
            lpdOutput.close()

            val lpdDetections = parseYoloOutput(lpdRaw, 0.25f)
            val plates = ImageProcessor.nms(lpdDetections, 0.25f, 0.45f)
            lpdResult.bitmap.recycle()

            if (plates.isNotEmpty()) {
                val plate = plates.first()
                val s = lpdResult.scale
                val px = lpdResult.padX; val py = lpdResult.padY
                val bx1 = ((plate.x1 - px) / s).coerceIn(0f, origW.toFloat())
                val by1 = ((plate.y1 - py) / s).coerceIn(0f, origH.toFloat())
                val bx2 = ((plate.x2 - px) / s).coerceIn(0f, origW.toFloat())
                val by2 = ((plate.y2 - py) / s).coerceIn(0f, origH.toFloat())

                val cw = (bx2 - bx1).toInt().coerceAtLeast(1)
                val ch = (by2 - by1).toInt().coerceAtLeast(1)

                if (cw >= 10 && ch >= 10) {
                    val cropBmp = android.graphics.Bitmap.createBitmap(bmp, bx1.toInt(), by1.toInt(), cw, ch)
                    val lprFull = runLPR(cropBmp)
                    cropBmp.recycle()

                    r.put("plate", lprFull.plate)
                    r.put("confidence", "%.4f".format(lprFull.confidence))
                    r.put("charCount", lprFull.chars.size)
                } else {
                    r.put("plate", "unknown")
                    r.put("confidence", 0.0)
                    r.put("reason", "crop too small ${cw}x$ch")
                }
            } else {
                r.put("plate", "unknown")
                r.put("confidence", 0.0)
                r.put("reason", "no plate detected")
            }
        } finally {
            bmp.recycle()
        }

        val latency = System.currentTimeMillis() - startTime
        r.put("latencyMs", latency)
        results.put(r)
    }

    private fun runLPR(bitmap: android.graphics.Bitmap): LprFullResult {
        val lprSize = 640
        val lprResult = ImageProcessor.letterbox(bitmap, lprSize)
        val lprInput = ImageProcessor.bitmapToFloatArray(lprResult.bitmap)
        val lprInputTensor = OnnxTensor.createTensor(ortEnv,
            FloatBuffer.wrap(lprInput),
            longArrayOf(1, 3, lprSize.toLong(), lprSize.toLong())
        )
        val lprOutput = lprSession!!.run(mapOf("input" to lprInputTensor))
        lprInputTensor.close()

        try {
            val lprRaw = (lprOutput.get("output").get().value as Array<*>)[0] as Array<FloatArray>
            val lprDetections = parseYoloOutput(lprRaw, 0.60f)
            val chars = ImageProcessor.nms(lprDetections, 0.60f, 0.45f)
            if (chars.size in 7..10) {
                val plate = ImageProcessor.readPlate(chars)
                val avgConf = if (chars.isNotEmpty()) chars.sumOf { it.conf.toDouble() }.toFloat() / chars.size else 0f
                return LprFullResult(plate, avgConf, chars)
            }
        } catch (_: Exception) {
        } finally {
            lprOutput.close()
        }
        return LprFullResult()
    }

    private fun parseYoloOutput(output: Array<FloatArray>, confThres: Float): List<Detection> {
        val detections = mutableListOf<Detection>()
        for (row in output) {
            if (row.size < 6) continue
            val objConf = row[4]
            if (objConf < 0.001f) continue
            val clsId = row.indices.drop(5).maxByOrNull { row[it] } ?: 5
            val clsConf = row[clsId]
            val conf = objConf * clsConf
            if (conf < confThres) continue
            val cx = row[0]; val cy = row[1]; val w = row[2]; val h = row[3]
            detections.add(Detection(
                cx - w / 2f, cy - h / 2f, cx + w / 2f, cy + h / 2f, conf, clsId - 5
            ))
        }
        return detections
    }
}
