package com.smartparkingapp

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.*
import android.media.Image
import android.os.BatteryManager
import android.os.Build
import android.util.Log
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import kotlin.math.abs

data class Detection(
    val x1: Float, val y1: Float, val x2: Float, val y2: Float,
    val conf: Float, val cls: Int
)

data class LprFullResult(
    val plate: String = "unknown",
    val confidence: Float = 0f,
    val chars: List<Detection> = emptyList()
)

data class PipelineResult(
    val plate: String = "unknown",
    val confidence: Float = 0f,
    val bbox: Detection? = null,
    val charBboxes: List<Detection> = emptyList(),
    val imageWidth: Int = 0,
    val imageHeight: Int = 0,
    val timingPreMs: Int = 0,
    val timingLpdMs: Int = 0,
    val timingLprMs: Int = 0,
    val timingTotalMs: Int = 0
)

object LprDetector {
    private const val TAG = "LprDetector"
    private const val MODEL_CACHE_VERSION = 4
    private const val CACHE_VERSION_FILE = "model_cache_version.txt"
    private const val MIN_VALID_MODEL_SIZE = 70_000_000L

    private var initialized = false
    private val lock = Any()
    private var appContext: Context? = null

    private lateinit var ortEnv: OrtEnvironment
    private var lpdSession: OrtSession? = null
    private var lprSession: OrtSession? = null

    private var activeProvider: String = "unknown"

    private var frameCount = 0
    private var cachedPlateBbox: Detection? = null
    private var cachedCharBboxes: List<Detection> = emptyList()
    private var cachedPlateText: String = ""
    private var lastPlateConfidence: Float = 0f
    private var consecutivePlateFrames: Int = 0
    private var stableTrackingFrames: Int = 0
    private var lpdFloatBuffer: FloatArray? = null
    private var lprFloatBuffer: FloatArray? = null
    private var lpdDirectBuf: ByteBuffer? = null
    private var lprDirectBuf: ByteBuffer? = null
    private var lpdTensor: OnnxTensor? = null
    private var lprTensor: OnnxTensor? = null
    private const val BUFFER_SIZE = 3 * 640 * 640

    private var thermalLevel: Int = 0
    private var isCharging: Boolean = true
    private var batteryPercent: Int = 100
    private var lastThermalCheckMs: Long = 0
    private var lpdThermalInterval: Int = 1
    private const val THERMAL_CHECK_MS = 5000L
    private const val MOTION_TOLERANCE = 15f
    private const val STABLE_CONFIDENCE = 0.85f

    fun getActiveProvider(): String = activeProvider

    fun initialize(context: Context) {
        synchronized(lock) {
            if (initialized) return
            appContext = context.applicationContext
            ortEnv = OrtEnvironment.getEnvironment()
            loadSessions(context)
            warmUp()
            initialized = true
            Log.d(TAG, "LprDetector initialized ($activeProvider)")
            LogBuffer.add("[ORT] LprDetector initialized, provider=$activeProvider")
        }
    }

    private fun loadSessions(context: Context) {
        if (lpdSession != null && lprSession != null) return
        val lpdPath = assetFilePath(context, "LP_detector.onnx")
        val lprPath = assetFilePath(context, "LP_ocr.onnx")

        val available = try {
            val m = OrtEnvironment::class.java.getMethod("getAvailableProviders")
            @Suppress("UNCHECKED_CAST")
            (m.invoke(null) as Set<String>).joinToString()
        } catch (e: Exception) { "unknown" }
        Log.d(TAG, "[ORT] Available: $available")

        val opts = OrtSession.SessionOptions()
        opts.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
        opts.setIntraOpNumThreads(4)
        opts.setMemoryPatternOptimization(true)

        try { opts.javaClass.getMethod("enableCpuMemArena").invoke(opts); Log.d(TAG, "[ORT] CPU mem arena ON") }
        catch (e: Exception) { Log.d(TAG, "[ORT] CPU mem arena: ${e.message}") }

        try {
            val m = opts::class.java.methods.firstOrNull { it.name == "setExecutionMode" }
            if (m != null) {
                val pt = m.parameterTypes[0]
                val arg = if (pt.isEnum) pt.enumConstants[1] else 1
                m.invoke(opts, arg)
                Log.d(TAG, "[ORT] PARALLEL mode ON")
            }
        } catch (e: Exception) { Log.d(TAG, "[ORT] PARALLEL mode: ${e.message}") }

        try {
            val addXnnpack = opts::class.java.methods.firstOrNull { it.name == "addXnnpack" && it.parameterCount == 0 }
            addXnnpack?.invoke(opts)
            if (addXnnpack != null) Log.d(TAG, "[ORT] XNNPACK enabled")
        } catch (e: Exception) { Log.d(TAG, "[ORT] XNNPACK fail: ${e.message}") }
        try {
            val addNnapi = opts::class.java.methods.firstOrNull { it.name == "addNnapi" }
            if (addNnapi != null) {
                when (addNnapi.parameterCount) {
                    1 -> {
                        val flagClass = addNnapi.parameterTypes[0]
                        val useFp16 = try { flagClass.getField("NNAPI_FLAGS_USE_FP16").get(null) } catch (_: Exception) { null }
                        if (useFp16 != null) {
                            addNnapi.invoke(opts, useFp16)
                            Log.d(TAG, "[ORT] NNAPI with FP16 enabled")
                        } else {
                            addNnapi.invoke(opts, 0)
                            Log.d(TAG, "[ORT] NNAPI enabled (no FP16 flag)")
                        }
                    }
                    0 -> { addNnapi.invoke(opts); Log.d(TAG, "[ORT] NNAPI enabled") }
                }
            }
        } catch (e: Exception) { Log.d(TAG, "[ORT] NNAPI fail: ${e.message}") }

        lpdSession = ortEnv.createSession(lpdPath, opts)
        lprSession = ortEnv.createSession(lprPath, opts)
        lpdFloatBuffer = FloatArray(BUFFER_SIZE)
        lprFloatBuffer = FloatArray(BUFFER_SIZE)
        lpdDirectBuf = ByteBuffer.allocateDirect(BUFFER_SIZE * 4).order(ByteOrder.nativeOrder())
        lprDirectBuf = ByteBuffer.allocateDirect(BUFFER_SIZE * 4).order(ByteOrder.nativeOrder())
        val shape = longArrayOf(1, 3, 640, 640)
        lpdTensor = OnnxTensor.createTensor(ortEnv, lpdDirectBuf!!.asFloatBuffer(), shape)
        lprTensor = OnnxTensor.createTensor(ortEnv, lprDirectBuf!!.asFloatBuffer(), shape)

        val ep = when {
            "XnnpackExecutionProvider" in available -> "XNNPACK"
            "NnapiExecutionProvider" in available -> "NNAPI"
            else -> "CPU"
        }
        activeProvider = ep
        Log.d(TAG, "[ORT] Sessions created (threads=4, $ep)")
    }

    private fun warmUp() {
        try {
            val dummy = FloatArray(1 * 3 * 640 * 640) { 0.5f }
            val buf = FloatBuffer.wrap(dummy)
            val shape = longArrayOf(1, 3, 640, 640)
            val t1 = OnnxTensor.createTensor(ortEnv, buf, shape)
            lpdSession!!.run(mapOf("input" to t1)).close(); t1.close()
            Log.d(TAG, "[ORT] warm-up LPD done")
            val t2 = OnnxTensor.createTensor(ortEnv, buf, shape)
            lprSession!!.run(mapOf("input" to t2)).close(); t2.close()
            Log.d(TAG, "[ORT] warm-up LPR done")
        } catch (e: Exception) {
            Log.d(TAG, "[ORT] warm-up fail: ${e.message}")
        }
    }

    private fun assetFilePath(context: Context, name: String): String {
        val file = File(context.filesDir, name)
        val versionFile = File(context.filesDir, CACHE_VERSION_FILE)
        val cachedVersion = try { versionFile.readText().trim().toInt() } catch (_: Exception) { 0 }
        if (cachedVersion == MODEL_CACHE_VERSION && file.exists() && file.length() >= MIN_VALID_MODEL_SIZE) {
            return file.absolutePath
        }
        copyModelFromAssets(context, file, name)
        versionFile.writeText(MODEL_CACHE_VERSION.toString())
        if (file.length() < MIN_VALID_MODEL_SIZE) {
            file.delete()
            throw IllegalStateException("$name copied but size ${file.length()} < $MIN_VALID_MODEL_SIZE")
        }
        return file.absolutePath
    }

    private fun copyModelFromAssets(context: Context, file: File, name: String) {
        file.delete()
        try {
            context.assets.open(name).use { input ->
                FileOutputStream(file).use { output -> input.copyTo(output) }
            }
        } catch (e: Exception) {
            file.delete()
            throw e
        }
    }

    fun runFullPipeline(bitmap: Bitmap): PipelineResult {
        val origW = bitmap.width
        val origH = bitmap.height
        val t0 = System.currentTimeMillis()

        updateThermalState()

        if (stableTrackingFrames > 0) {
            stableTrackingFrames--
            return PipelineResult(
                plate = cachedPlateText, confidence = lastPlateConfidence,
                bbox = cachedPlateBbox, charBboxes = cachedCharBboxes,
                imageWidth = origW, imageHeight = origH,
                timingPreMs = 0, timingLpdMs = 0, timingLprMs = 0, timingTotalMs = 0
            )
        }

        frameCount++
        if (frameCount % lpdThermalInterval != 0) {
            if (cachedPlateText.isNotEmpty()) {
                return PipelineResult(
                    plate = cachedPlateText, confidence = lastPlateConfidence,
                    bbox = cachedPlateBbox, charBboxes = cachedCharBboxes,
                    imageWidth = origW, imageHeight = origH,
                    timingPreMs = 0, timingLpdMs = 0, timingLprMs = 0, timingTotalMs = 0
                )
            }
        }

        val lpdBuf = lpdFloatBuffer ?: FloatArray(BUFFER_SIZE)
        val lpdResult = ImageProcessor.fillLetterboxFloat(bitmap, lpdBuf, 640)

        lpdDirectBuf!!.rewind()
        lpdDirectBuf!!.asFloatBuffer().put(lpdBuf)

        val t1 = System.currentTimeMillis()
        val lpdOutput = lpdSession!!.run(mapOf("input" to lpdTensor!!))
        val tLpd = System.currentTimeMillis() - t1
        val lpdRaw = (lpdOutput.get("output").get().value as Array<*>)[0] as Array<FloatArray>
        lpdOutput.close()

        val lpdDetections = parseYoloOutput(lpdRaw, 0.25f)
        val plates = ImageProcessor.nms(lpdDetections, 0.25f, 0.45f)

        if (plates.isEmpty()) {
            consecutivePlateFrames = 0
            Log.d(TAG, "TIMING pre=${t1 - t0}ms LPD=${tLpd}ms post=0ms TOTAL=${System.currentTimeMillis() - t0}ms no_plate")
            return PipelineResult(
                imageWidth = origW, imageHeight = origH,
                timingPreMs = (t1 - t0).toInt(), timingLpdMs = tLpd.toInt(),
                timingLprMs = 0, timingTotalMs = (System.currentTimeMillis() - t0).toInt()
            )
        }

        val plate = plates.first()
        val s = lpdResult.scale
        val px = lpdResult.padX
        val py = lpdResult.padY
        val bx1 = ((plate.x1 - px) / s).coerceIn(0f, origW.toFloat())
        val by1 = ((plate.y1 - py) / s).coerceIn(0f, origH.toFloat())
        val bx2 = ((plate.x2 - px) / s).coerceIn(0f, origW.toFloat())
        val by2 = ((plate.y2 - py) / s).coerceIn(0f, origH.toFloat())

        val plateBbox = Detection(bx1, by1, bx2, by2, plate.conf, plate.cls)
        val cw = (bx2 - bx1).toInt().coerceAtLeast(1)
        val ch = (by2 - by1).toInt().coerceAtLeast(1)

        if (cw < 10 || ch < 10) {
            consecutivePlateFrames = 0
            Log.d(TAG, "TIMING pre=${t1 - t0}ms LPD=${tLpd}ms post=0ms TOTAL=${System.currentTimeMillis() - t0}ms small_plate")
            return PipelineResult(
                bbox = plateBbox, imageWidth = origW, imageHeight = origH,
                timingPreMs = (t1 - t0).toInt(), timingLpdMs = tLpd.toInt(),
                timingLprMs = 0, timingTotalMs = (System.currentTimeMillis() - t0).toInt()
            )
        }

        val adaptiveInterval = when {
            lastPlateConfidence > 0.9f -> 4
            lastPlateConfidence > 0.7f -> 2
            else -> 1
        }
        val skipLpr = frameCount % adaptiveInterval != 0
        val hasCache = cachedPlateBbox != null && cachedCharBboxes.isNotEmpty()

        val tLpr: Long
        val best: LprFullResult
        val projChars: List<Detection>

        if (skipLpr && hasCache) {
            tLpr = 0
            val dx = bx1 - cachedPlateBbox!!.x1
            val dy = by1 - cachedPlateBbox!!.y1
            projChars = cachedCharBboxes.map { c ->
                Detection(c.x1 + dx, c.y1 + dy, c.x2 + dx, c.y2 + dy, c.conf, c.cls)
            }
            best = LprFullResult(cachedPlateText, 1f, emptyList())
            Log.d(TAG, "LPR_SKIP interval=$adaptiveInterval dx=${dx.toInt()} dy=${dy.toInt()} plate=$cachedPlateText")
            cachedPlateBbox = plateBbox
        } else {
            val t2 = System.currentTimeMillis()
            val cropBmp = Bitmap.createBitmap(bitmap, bx1.toInt(), by1.toInt(), cw, ch)
            var lprResult = runLPR(cropBmp)
            tLpr = System.currentTimeMillis() - t2
            if (!ImageProcessor.isValidVietnamPlate(lprResult.plate)) lprResult = LprFullResult()
            cropBmp.recycle()

            projChars = if (lprResult.chars.isNotEmpty() && lprResult.plate.isNotEmpty()) {
                val iw = cw.toFloat(); val ih = ch.toFloat()
                lprResult.chars.map { c ->
                    Detection(
                        bx1 + (c.x1 / iw) * cw, by1 + (c.y1 / ih) * ch,
                        bx2 - ((1f - c.x2 / iw) * cw).coerceAtLeast(0f), by2 - ((1f - c.y2 / ih) * ch).coerceAtLeast(0f),
                        c.conf, c.cls
                    )
                }
            } else emptyList()

            best = lprResult
            if (lprResult.plate.isNotEmpty() && projChars.isNotEmpty()) {
                val dx = abs(bx1 - (cachedPlateBbox?.x1 ?: -999f))
                val dy = abs(by1 - (cachedPlateBbox?.y1 ?: -999f))
                if (dx < MOTION_TOLERANCE && dy < MOTION_TOLERANCE && lprResult.confidence > STABLE_CONFIDENCE) {
                    consecutivePlateFrames++
                    if (consecutivePlateFrames >= 3) {
                        stableTrackingFrames = 5
                        consecutivePlateFrames = 0
                        Log.d(TAG, "STABLE_TRACK: holdoff=5, plate=$cachedPlateText")
                    }
                } else {
                    consecutivePlateFrames = 0
                }
                cachedPlateBbox = plateBbox
                cachedCharBboxes = projChars
                cachedPlateText = lprResult.plate
                lastPlateConfidence = lprResult.confidence
            }
        }

        val tTotal = System.currentTimeMillis() - t0
        val inferLabel = if (skipLpr && hasCache) "LPR_SKIP" else "LPR_FULL"
        Log.d(TAG, "TIMING pre=${t1 - t0}ms LPD=${tLpd}ms ${inferLabel}=${tLpr}ms TOTAL=${tTotal}ms plate=${best.plate}")
        return PipelineResult(
            plate = best.plate, confidence = best.confidence,
            bbox = plateBbox, charBboxes = projChars,
            imageWidth = origW, imageHeight = origH,
            timingPreMs = (t1 - t0).toInt(), timingLpdMs = tLpd.toInt(),
            timingLprMs = tLpr.toInt(), timingTotalMs = tTotal.toInt()
        )
    }

    private fun updateThermalState() {
        val ctx = appContext ?: return
        val now = System.currentTimeMillis()
        if (now - lastThermalCheckMs < THERMAL_CHECK_MS) return
        lastThermalCheckMs = now
        try {
            val bm = ctx.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager ?: return
            val tempTenths = if (Build.VERSION.SDK_INT >= 31) bm.getIntProperty(2) else {
                ctx.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 350) ?: 350
            }
            batteryPercent = bm.getIntProperty(4)
            isCharging = ctx.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))?.getIntExtra(BatteryManager.EXTRA_STATUS, -1)?.let {
                it == BatteryManager.BATTERY_STATUS_CHARGING || it == BatteryManager.BATTERY_STATUS_FULL
            } ?: true

            val tempC = tempTenths / 10f
            thermalLevel = when {
                tempC < 35f -> 0
                tempC < 40f -> 1
                else -> 2
            }
            val chargeBoost = if (isCharging && batteryPercent > 20) 0 else 1
            val level = (thermalLevel + chargeBoost).coerceIn(0, 2)
            lpdThermalInterval = when (level) {
                0 -> 1
                1 -> 2
                else -> 4
            }
            if (lpdThermalInterval > 1) {
                Log.d(TAG, "THERMAL temp=${tempC}°C lvl=$level bat=$batteryPercent% charge=$isCharging interval=$lpdThermalInterval")
            }
        } catch (_: Exception) {}
    }

    fun imageToBitmap(image: Image, maxDim: Int = 640): Bitmap {
        val imgW = image.width; val imgH = image.height
        val scale = minOf(maxDim.toFloat() / imgW, maxDim.toFloat() / imgH, 1f)
        val outW = (imgW * scale).toInt().coerceAtLeast(1)
        val outH = (imgH * scale).toInt().coerceAtLeast(1)

        val planes = image.planes
        val yRowStride = planes[0].rowStride
        val uvRowStride = planes[1].rowStride
        val uvPixelStride = planes[1].pixelStride

        val yArr = ByteArray(planes[0].buffer.remaining()).also { planes[0].buffer.get(it) }
        val uArr = ByteArray(planes[1].buffer.remaining()).also { planes[1].buffer.get(it) }
        val vArr = ByteArray(planes[2].buffer.remaining()).also { planes[2].buffer.get(it) }

        val pixels = IntArray(outW * outH)
        for (oy in 0 until outH) {
            val srcY = (oy / scale).toInt().coerceIn(0, imgH - 1)
            for (ox in 0 until outW) {
                val srcX = (ox / scale).toInt().coerceIn(0, imgW - 1)
                val yi = srcY * yRowStride + srcX
                val ui = (srcY / 2) * uvRowStride + (srcX / 2) * uvPixelStride
                val y = yArr[yi].toInt() and 0xFF
                val u = (uArr[ui].toInt() and 0xFF) - 128
                val v = (vArr[ui].toInt() and 0xFF) - 128
                val r = (y + 1.402f * v).toInt().coerceIn(0, 255)
                val g = (y - 0.344f * u - 0.714f * v).toInt().coerceIn(0, 255)
                val b = (y + 1.772f * u).toInt().coerceIn(0, 255)
                pixels[oy * outW + ox] = Color.rgb(r, g, b)
            }
        }
        return Bitmap.createBitmap(pixels, outW, outH, Bitmap.Config.ARGB_8888)
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
            detections.add(Detection(cx - w / 2f, cy - h / 2f, cx + w / 2f, cy + h / 2f, conf, clsId - 5))
        }
        return detections
    }

    private fun runLPR(bitmap: Bitmap): LprFullResult {
        val lprSize = 640
        val lprBuf = lprFloatBuffer ?: FloatArray(BUFFER_SIZE)
        val lprResult = ImageProcessor.fillLetterboxFloat(bitmap, lprBuf, lprSize)

        lprDirectBuf!!.rewind()
        lprDirectBuf!!.asFloatBuffer().put(lprBuf)

        val tLpr = System.currentTimeMillis()
        val lprOutput = lprSession!!.run(mapOf("input" to lprTensor!!))
        val lprMs = System.currentTimeMillis() - tLpr
        try {
            val lprRaw = (lprOutput.get("output").get().value as Array<*>)[0] as Array<FloatArray>
            val lprDetections = parseYoloOutput(lprRaw, 0.60f)
            val chars = ImageProcessor.nms(lprDetections, 0.60f, 0.45f)
            if (chars.size in 7..10) {
                val plate = ImageProcessor.readPlate(chars)
                val avgConf = if (chars.isNotEmpty()) chars.sumOf { it.conf.toDouble() }.toFloat() / chars.size else 0f
                val s = lprResult.scale; val px = lprResult.padX; val py = lprResult.padY
                val proj = chars.map { c -> Detection((c.x1 - px) / s, (c.y1 - py) / s, (c.x2 - px) / s, (c.y2 - py) / s, c.conf, c.cls) }
                Log.d(TAG, "TIMING LPR_run=${lprMs}ms chars=${chars.size} plate=${plate}")
                return LprFullResult(plate, avgConf, proj)
            }
            Log.d(TAG, "TIMING LPR_run=${lprMs}ms chars=${chars.size} no_valid_plate")
        } catch (e: Exception) {
            Log.d(TAG, "LPR parse error: ${e.message}")
        } finally { lprOutput.close() }
        return LprFullResult()
    }

}
