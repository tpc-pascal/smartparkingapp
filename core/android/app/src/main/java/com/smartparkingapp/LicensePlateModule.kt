package com.smartparkingapp

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

data class Detection(
    val x1: Float, val y1: Float, val x2: Float, val y2: Float,
    val conf: Float, val cls: Int
)

class LicensePlateModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

    override fun getName() = "LicensePlateModule"

    private val ortEnv = OrtEnvironment.getEnvironment()
    private var lpdSession: OrtSession? = null
    private var lprSession: OrtSession? = null

    private fun sendLog(msg: String) {
        Log.d("LPR", msg)
        try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("LPR_LOG", msg)
        } catch (_: Exception) {}
    }

    private fun loadSessions() {
        if (lpdSession == null) {
            val lpdPath = assetFilePath(reactApplicationContext, "LP_detector.onnx")
            val lprPath = assetFilePath(reactApplicationContext, "LP_ocr.onnx")
            lpdSession = ortEnv.createSession(lpdPath)
            lprSession = ortEnv.createSession(lprPath)
            sendLog("ONNX sessions loaded")
        }
    }

    private fun assetFilePath(context: Context, name: String): String {
        val file = File(context.filesDir, name)
        if (file.exists() && file.length() > 0) return file.absolutePath
        context.assets.open(name).use { input ->
            FileOutputStream(file).use { output -> input.copyTo(output) }
        }
        return file.absolutePath
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

    @ReactMethod
    fun recognizePlate(imagePath: String, promise: Promise) {
        sendLog("===> recognizePlate: $imagePath")
        try {
            loadSessions()
            val cleanPath = imagePath.removePrefix("file://")
            val bitmap = BitmapFactory.decodeFile(cleanPath)
                ?: run { sendLog("FAIL: cannot decode bitmap"); promise.resolve("unknown"); return }

            val origW = bitmap.width; val origH = bitmap.height

            // Step 1: LPD - detect license plate
            val lpdResult = ImageProcessor.letterbox(bitmap, 640)
            val lpdInput = ImageProcessor.bitmapToFloatArray(lpdResult.bitmap)
            val lpdInputTensor = OnnxTensor.createTensor(ortEnv,
                FloatBuffer.wrap(lpdInput),
                longArrayOf(1, 3, 640, 640)
            )
            val lpdOutput = lpdSession!!.run(mapOf("input" to lpdInputTensor))
            lpdInputTensor.close()
            val lpdRaw = (lpdOutput.get("output").get().value as Array<*>)[0] as Array<FloatArray>
            sendLog("LPD output: ${lpdRaw.size} detections")

            val lpdDetections = parseYoloOutput(lpdRaw, 0.25f)
            val plates = ImageProcessor.nms(lpdDetections, 0.25f, 0.45f)
            sendLog("LPD after NMS: ${plates.size} plate(s)")

            val map = Arguments.createMap()
            var bx1 = 0f; var by1 = 0f; var bx2 = 0f; var by2 = 0f

            if (plates.isNotEmpty()) {
                val plate = plates.first()
                val s = lpdResult.scale
                val px = lpdResult.padX; val py = lpdResult.padY
                bx1 = ((plate.x1 - px) / s).coerceIn(0f, origW.toFloat())
                by1 = ((plate.y1 - py) / s).coerceIn(0f, origH.toFloat())
                bx2 = ((plate.x2 - px) / s).coerceIn(0f, origW.toFloat())
                by2 = ((plate.y2 - py) / s).coerceIn(0f, origH.toFloat())
                sendLog("Plate bbox: [${bx1.toInt()},${by1.toInt()},${bx2.toInt()},${by2.toInt()}]")

                val bbox = Arguments.createMap()
                bbox.putDouble("x1", bx1.toDouble())
                bbox.putDouble("y1", by1.toDouble())
                bbox.putDouble("x2", bx2.toDouble())
                bbox.putDouble("y2", by2.toDouble())
                map.putMap("bbox", bbox)

                val cw = (bx2 - bx1).toInt().coerceAtLeast(1)
                val ch = (by2 - by1).toInt().coerceAtLeast(1)
                val cropBmp = Bitmap.createBitmap(bitmap, bx1.toInt(), by1.toInt(), cw, ch)

                // Step 2: Deskew
                val deskewed = ImageProcessor.deskew(cropBmp)
                sendLog("Deskewed: ${deskewed.width}x${deskewed.height}")

                // Step 3: LPR - recognize characters
                val lprResult = ImageProcessor.letterbox(deskewed, 640)
                val lprInput = ImageProcessor.bitmapToFloatArray(lprResult.bitmap)
                val lprInputTensor = OnnxTensor.createTensor(ortEnv,
                    FloatBuffer.wrap(lprInput),
                    longArrayOf(1, 3, 640, 640)
                )
                val lprOutput = lprSession!!.run(mapOf("input" to lprInputTensor))
                lprInputTensor.close()
                val lprRaw = (lprOutput.get("output").get().value as Array<*>)[0] as Array<FloatArray>
                sendLog("LPR output: ${lprRaw.size} detections")

                val lprDetections = parseYoloOutput(lprRaw, 0.60f)
                val chars = ImageProcessor.nms(lprDetections, 0.60f, 0.45f)
                sendLog("LPR chars: ${chars.size} -> ${chars.map { ImageProcessor.CHAR_MAP[it.cls] }}")

                if (chars.size < 7 || chars.size > 10) {
                    sendLog("RESULT: ${chars.size} chars (need 7-10) -> unknown")
                    map.putString("plate", "unknown")
                } else {
                    val result = ImageProcessor.readPlate(chars)
                    sendLog("RESULT: $result")
                    map.putString("plate", result)
                }
            } else {
                map.putString("plate", "unknown")
            }

            promise.resolve(map)
        } catch (e: Exception) {
            sendLog("CRASH: ${e.message}")
            promise.resolve("unknown")
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {}
    @ReactMethod
    fun removeListeners(count: Int) {}
}
