package com.smartparkingapp

import android.content.Context
import android.graphics.*
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import kotlin.math.abs
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.nio.FloatBuffer

data class Detection(
    val x1: Float, val y1: Float, val x2: Float, val y2: Float,
    val conf: Float, val cls: Int
)

data class LprResult(val plate: String = "unknown", val confidence: Float = 0f)

data class LprFullResult(
    val plate: String = "unknown",
    val confidence: Float = 0f,
    val chars: List<Detection> = emptyList()
)

private val LPR_CHARS = arrayOf(
    "1", "2", "3", "4", "5", "6", "7", "8", "9",
    "A", "B", "C", "D", "E", "F", "G", "H", "K",
    "L", "M", "N", "P", "S", "T", "U", "V", "X", "Y", "Z",
    "0"
)

class LicensePlateModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

    override fun getName() = "LicensePlateModule"

    private val moduleScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val ortEnv by lazy { OrtEnvironment.getEnvironment() }
    private var lpdSession: OrtSession? = null
    private var lprSession: OrtSession? = null

    // Tracking state (persists across recognizePlate calls)
    private var trackedCx = -1f
    private var trackedCy = -1f
    private var trackedW = -1f
    private var trackedH = -1f
    private var isTracking = false
    private var frameCount = 0
    // Temporal voting: plate must appear in ≥2 of last 3 frames
    private val voteRing = Array(3) { "" }
    private var votePtr = 0
    private var votedPlate = ""
    private var votedCount = 0

    init {
        moduleScope.launch {
            try {
                loadSessions()
                sendLog("Model sessions preloaded in background")
            } catch (e: Exception) {
                sendLog("Preload failed (will load on demand): ${e.message}")
            }
        }
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        moduleScope.cancel()
    }

    private fun sendLog(msg: String) {
        Log.d("LPR", msg)
        LogBuffer.add("LPR: $msg")
        try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("LPR_LOG", msg)
        } catch (_: Exception) {}
    }

    @Synchronized
    private fun loadSessions() {
        if (lpdSession == null) {
            val lpdPath = assetFilePath(reactApplicationContext, "LP_detector.onnx")
            val lprPath = assetFilePath(reactApplicationContext, "LP_ocr.onnx")
            val opts = OrtSession.SessionOptions()
            opts.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
            opts.setIntraOpNumThreads(4)
            opts.setMemoryPatternOptimization(true)
            sendLog("Creating LPD session from: $lpdPath")
            lpdSession = ortEnv.createSession(lpdPath, opts)
            sendLog("Creating LPR session from: $lprPath")
            lprSession = ortEnv.createSession(lprPath, opts)
            sendLog("ONNX sessions loaded OK")
        }
    }

    companion object {
        private const val MODEL_CACHE_VERSION = 4
        private const val CACHE_VERSION_FILE = "model_cache_version.txt"
        private const val MIN_VALID_MODEL_SIZE = 70_000_000L
    }

    private fun assetFilePath(context: Context, name: String): String {
        val file = File(context.filesDir, name)
        val versionFile = File(context.filesDir, CACHE_VERSION_FILE)
        val cachedVersion = try { versionFile.readText().trim().toInt() } catch (_: Exception) { 0 }
        if (cachedVersion == MODEL_CACHE_VERSION && file.exists() && file.length() >= MIN_VALID_MODEL_SIZE) {
            sendLog("Asset $name cached (${file.length()} bytes) v$cachedVersion")
            return file.absolutePath
        }
        copyModelFromAssets(context, file, name)
        versionFile.writeText(MODEL_CACHE_VERSION.toString())
        sendLog("Asset $name copied (${file.length()} bytes) v$MODEL_CACHE_VERSION")
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

    private fun runLPR(bitmap: Bitmap): LprFullResult {
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
                sendLog("LPR: $plate conf=${"%.3f".format(avgConf)} (${chars.size} chars)")
                // Project char coords from 640x640 letterbox back to input bitmap space
                val s = lprResult.scale; val px = lprResult.padX; val py = lprResult.padY
                val projChars = chars.map { c ->
                    Detection(
                        (c.x1 - px) / s, (c.y1 - py) / s,
                        (c.x2 - px) / s, (c.y2 - py) / s,
                        c.conf, c.cls
                    )
                }
                return LprFullResult(plate, avgConf, projChars)
            } else {
                sendLog("LPR nms returned ${chars.size} chars (expect 7-10)")
            }
        } catch (e: Exception) {
            sendLog("LPR parse error: ${e.message}")
        } finally {
            lprOutput.close()
        }
        return LprFullResult()
    }

    @ReactMethod
    fun recognizePlate(imagePath: String, promise: Promise) {
        sendLog("===> recognizePlate: $imagePath")
        moduleScope.launch {
            try {
                withTimeout(25000L) {
                    doRecognize(imagePath, promise)
                }
            } catch (e: TimeoutCancellationException) {
                sendLog("TIMEOUT: inference exceeded 25s")
                resolveUnknown(promise)
            } catch (e: Exception) {
                sendLog("CRASH: ${e.message}")
                resolveUnknown(promise)
            } finally {
                try {
                    val cleanPath = imagePath.removePrefix("file://")
                    val file = File(cleanPath)
                    if (file.exists()) {
                        file.delete()
                        sendLog("Temp snapshot deleted: $cleanPath")
                    }
                } catch (_: Exception) {}
            }
        }
    }

    private fun doRecognize(imagePath: String, promise: Promise) {
        loadSessions()
        val cleanPath = imagePath.removePrefix("file://")
        val bitmap = BitmapFactory.decodeFile(cleanPath)
            ?: run { sendLog("FAIL: cannot decode bitmap"); resolveUnknown(promise); return }
        sendLog("Bitmap decoded: ${bitmap.width}x${bitmap.height}")

        try {
            val origW = bitmap.width; val origH = bitmap.height

            // Step 1: LPD
            sendLog("LPD: letterbox + inference...")
            val lpdResult = ImageProcessor.letterbox(bitmap, 640)
            val lpdInput = ImageProcessor.bitmapToFloatArray(lpdResult.bitmap)
            val lpdInputTensor = OnnxTensor.createTensor(ortEnv,
                FloatBuffer.wrap(lpdInput),
                longArrayOf(1, 3, 640, 640)
            )
            val lpdOutput = lpdSession!!.run(mapOf("input" to lpdInputTensor))
            lpdInputTensor.close()
            val lpdRaw = (lpdOutput.get("output").get().value as Array<*>)[0] as Array<FloatArray>
            lpdOutput.close()
            val maxRow = lpdRaw.maxByOrNull { it[4] }
            if (maxRow != null) sendLog("LPD max objConf=${"%.4f".format(maxRow[4])} row=[${maxRow.take(6).joinToString { "%.3f".format(it) }}]")
            else sendLog("LPD output empty")

            val lpdDetections = parseYoloOutput(lpdRaw, 0.25f)
            sendLog("LPD after parse: ${lpdDetections.size} detections above 0.25")
            val plates = ImageProcessor.nms(lpdDetections, 0.25f, 0.45f)
            sendLog("LPD after NMS: ${plates.size} plate(s)")

            lpdResult.bitmap.recycle()

            val map = Arguments.createMap()
            var finalPlate = ""

            if (plates.isNotEmpty()) {
                val plate = plates.first()
                val s = lpdResult.scale
                val px = lpdResult.padX; val py = lpdResult.padY
                val bx1 = ((plate.x1 - px) / s).coerceIn(0f, origW.toFloat())
                val by1 = ((plate.y1 - py) / s).coerceIn(0f, origH.toFloat())
                val bx2 = ((plate.x2 - px) / s).coerceIn(0f, origW.toFloat())
                val by2 = ((plate.y2 - py) / s).coerceIn(0f, origH.toFloat())

                val bbox = Arguments.createMap()
                bbox.putDouble("x1", bx1.toDouble())
                bbox.putDouble("y1", by1.toDouble())
                bbox.putDouble("x2", bx2.toDouble())
                bbox.putDouble("y2", by2.toDouble())
                map.putMap("bbox", bbox)

                val cw = (bx2 - bx1).toInt().coerceAtLeast(1)
                val ch = (by2 - by1).toInt().coerceAtLeast(1)
                val cwF = cw.toFloat()
                val chF = ch.toFloat()
                val plateCx = bx1 + cwF / 2f
                val plateCy = by1 + chF / 2f
                frameCount++

                // ---- Moving Average Tracking ----
                val posDeltaFlag = if (isTracking) {
                    val dcx = abs(plateCx - trackedCx) / origW
                    val dcy = abs(plateCy - trackedCy) / origH
                    dcx + dcy
                } else 99f

                val TRACK_DELTA_MAX = 0.10f
                if (!isTracking || posDeltaFlag > TRACK_DELTA_MAX) {
                    trackedCx = plateCx; trackedCy = plateCy
                    trackedW = cwF; trackedH = chF
                    isTracking = true
                    sendLog("Track: new position (${"%.0f".format(plateCx)},${"%.0f".format(plateCy)}) delta=${"%.3f".format(posDeltaFlag)}")
                } else {
                    trackedCx = 0.3f * plateCx + 0.7f * trackedCx
                    trackedCy = 0.3f * plateCy + 0.7f * trackedCy
                    trackedW = 0.3f * cwF + 0.7f * trackedW
                    trackedH = 0.3f * chF + 0.7f * trackedH
                }
                sendLog("Track: position (${"%.0f".format(trackedCx)},${"%.0f".format(trackedCy)}) est delta=${"%.3f".format(posDeltaFlag)}")

                // ---- Motion Blur Check ----
                var skipLprDueToBlur = false
                if (cw >= 20 && ch >= 20) {
                    val cropBmpLocal = Bitmap.createBitmap(bitmap, bx1.toInt(), by1.toInt(), cw, ch)
                    val blurVar = ImageProcessor.laplacianVariance(cropBmpLocal)
                    cropBmpLocal.recycle()
                    sendLog("Blur: Laplacian variance=${"%.1f".format(blurVar)}")
                    if (blurVar < 15f) {
                        sendLog("LPR skipped (blur variance ${"%.1f".format(blurVar)} < 15)")
                        skipLprDueToBlur = true
                    }
                }

                if (!skipLprDueToBlur && cw >= 10 && ch >= 10) {
                    sendLog("Crop: ($bx1,$by1)-($bx2,$by2) -> ${cw}x$ch")
                    val cropBmp = Bitmap.createBitmap(bitmap, bx1.toInt(), by1.toInt(), cw, ch)

                    sendLog("LPR on raw crop (fast path)...")
                    val raw = runLPR(cropBmp)
                    var best = raw

                    if (raw.confidence < 0.80f) {
                        sendLog("Raw crop conf=%.3f < 0.80, trying fast deskew...".format(raw.confidence))
                        val fast = runLPR(ImageProcessor.deskewFast(cropBmp))
                        if (fast.confidence > best.confidence) best = fast

                        if (best.confidence < 0.75f) {
                            sendLog("Best conf=%.3f < 0.75, trying CLAHE deskew...".format(best.confidence))
                            val clahe = runLPR(ImageProcessor.deskew(ImageProcessor.changeContrast(cropBmp), 1, 0))
                            if (clahe.confidence > best.confidence) best = clahe

                            val plain = runLPR(ImageProcessor.deskew(cropBmp, 0, 0))
                            if (plain.confidence > best.confidence) best = plain
                        }
                    } else {
                        sendLog("Raw conf=%.3f >= 0.80, skipping deskew".format(raw.confidence))
                    }

                    if (!ImageProcessor.isValidVietnamPlate(best.plate)) {
                        sendLog("Rejected (invalid VN format): ${best.plate}")
                        best = LprFullResult()
                    }
                    val currentPlate = best.plate
                    sendLog("LPR result: $currentPlate conf=${"%.3f".format(best.confidence)}")

                    voteRing[votePtr] = currentPlate
                    votePtr = (votePtr + 1) % 3
                    val counts = mutableMapOf<String, Int>()
                    for (p in voteRing) { if (p.isNotEmpty()) counts[p] = (counts[p] ?: 0) + 1 }
                    val bestVote = counts.maxByOrNull { it.value }
                    if (bestVote != null && bestVote.value >= 2) {
                        sendLog("Vote: ${bestVote.key} appeared ${bestVote.value}/3 frames")
                        finalPlate = bestVote.key
                        if (bestVote.key != votedPlate) { votedPlate = bestVote.key; votedCount = 1 }
                        else { votedCount++ }
                    } else {
                        sendLog("Vote: no consensus yet (${counts.map { "${it.key}=${it.value}" }.joinToString(", ") })")
                        finalPlate = currentPlate
                    }

                    if (best.chars.isNotEmpty() && currentPlate.isNotEmpty()) {
                        val charBboxes = Arguments.createArray()
                        val inputW = cw.toFloat(); val inputH = ch.toFloat()
                        val smoothBx1 = (trackedCx - trackedW / 2f).coerceAtLeast(0f)
                        val smoothBy1 = (trackedCy - trackedH / 2f).coerceAtLeast(0f)
                        val smoothCw = trackedW.coerceAtLeast(1f); val smoothCh = trackedH.coerceAtLeast(1f)
                        for (c in best.chars) {
                            val origX1 = smoothBx1 + (c.x1 / inputW) * smoothCw
                            val origY1 = smoothBy1 + (c.y1 / inputH) * smoothCh
                            val origX2 = smoothBx1 + (c.x2 / inputW) * smoothCw
                            val origY2 = smoothBy1 + (c.y2 / inputH) * smoothCh
                            val charIdx = c.cls
                            val chStr = if (charIdx in LPR_CHARS.indices) LPR_CHARS[charIdx] else "?"
                            val cm = Arguments.createMap()
                            cm.putString("char", chStr)
                            cm.putDouble("x1", origX1.toDouble())
                            cm.putDouble("y1", origY1.toDouble())
                            cm.putDouble("x2", origX2.toDouble())
                            cm.putDouble("y2", origY2.toDouble())
                            charBboxes.pushMap(cm)
                        }
                        map.putArray("charBboxes", charBboxes)
                    }

                    cropBmp.recycle()
                } else if (!skipLprDueToBlur) {
                    sendLog("LPR skipped (crop too small: ${cw}x$ch)")
                }
            } else {
                sendLog("LPD found 0 plates")
            }

            sendLog("RESULT: $finalPlate")
            map.putString("plate", finalPlate)
            map.putInt("imageWidth", origW)
            map.putInt("imageHeight", origH)
            promise.resolve(map)
        } finally {
            bitmap.recycle()
            sendLog("Main bitmap recycled")
        }
    }

    private fun resolveUnknown(promise: Promise) {
        try {
            val m = Arguments.createMap()
            m.putString("plate", "unknown")
            promise.resolve(m)
        } catch (_: Exception) {
            promise.resolve("unknown")
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {}
    @ReactMethod
    fun removeListeners(count: Int) {}
}
