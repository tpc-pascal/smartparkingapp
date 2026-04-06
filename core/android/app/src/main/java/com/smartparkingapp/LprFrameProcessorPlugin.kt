package com.smartparkingapp

import android.graphics.Bitmap
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.mrousavy.camera.frameprocessors.*
import java.util.HashMap

class LprFrameProcessorPlugin(
    proxy: VisionCameraProxy,
    options: Map<String, Any>?
) : FrameProcessorPlugin() {

    companion object {
        private const val TAG = "LprPlugin"
    }

    private val reactContext: ReactApplicationContext = proxy.context

    init {
        try {
            LprDetector.initialize(reactContext)
            Log.d(TAG, "LprDetector initialized from plugin")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize LprDetector: ${e.message}")
        }
    }

    override fun callback(frame: Frame, params: Map<String, Any>?): Any? {
        if (!frame.isValid) return null
        ensureInitialized()

        val image = try {
            frame.image
        } catch (e: Exception) {
            return null
        }

        if (image == null) return null

        val bitmap: Bitmap
        try {
            bitmap = LprDetector.imageToBitmap(image)
        } catch (e: Exception) {
            Log.d(TAG, "YUV→Bitmap failed: ${e.message}")
            return null
        }

        if (bitmap.width < 10 || bitmap.height < 10) {
            bitmap.recycle()
            return null
        }

        val result: PipelineResult
        try {
            result = LprDetector.runFullPipeline(bitmap)
        } catch (e: Exception) {
            Log.d(TAG, "Pipeline failed: ${e.message}")
            bitmap.recycle()
            return null
        } finally {
            bitmap.recycle()
        }

        val map = HashMap<String, Any>()
        map["plate"] = result.plate
        map["confidence"] = result.confidence.toDouble()
        map["imageWidth"] = result.imageWidth.toDouble()
        map["imageHeight"] = result.imageHeight.toDouble()

        if (result.bbox != null) {
            val bbox = HashMap<String, Double>()
            bbox["x1"] = result.bbox.x1.toDouble()
            bbox["y1"] = result.bbox.y1.toDouble()
            bbox["x2"] = result.bbox.x2.toDouble()
            bbox["y2"] = result.bbox.y2.toDouble()
            map["bbox"] = bbox
        }

        if (result.charBboxes.isNotEmpty()) {
            val chars = ArrayList<HashMap<String, Any>>()
            for ((i, c) in result.charBboxes.withIndex()) {
                val cm = HashMap<String, Any>()
                cm["x1"] = c.x1.toDouble()
                cm["y1"] = c.y1.toDouble()
                cm["x2"] = c.x2.toDouble()
                cm["y2"] = c.y2.toDouble()
                val charIdx = c.cls
                val chStr = if (charIdx in LPR_CHARS.indices) LPR_CHARS[charIdx] else "?"
                cm["char"] = chStr
                chars.add(cm)
            }
            map["charBboxes"] = chars
        }

        emitResult(map)
        return map
    }

    private fun ensureInitialized() {
        try {
            LprDetector.initialize(reactContext)
        } catch (e: Exception) {
            Log.e(TAG, "LprDetector init failed: ${e.message}")
        }
    }

    private fun emitResult(map: HashMap<String, Any>) {
        try {
            val args = Arguments.createMap()
            args.putString("plate", map["plate"] as? String ?: "unknown")
            args.putDouble("confidence", map["confidence"] as? Double ?: 0.0)
            args.putDouble("imageWidth", map["imageWidth"] as? Double ?: 0.0)
            args.putDouble("imageHeight", map["imageHeight"] as? Double ?: 0.0)

            (map["bbox"] as? HashMap<*, *>)?.let { b ->
                val bArgs = Arguments.createMap()
                bArgs.putDouble("x1", (b["x1"] as? Number)?.toDouble() ?: 0.0)
                bArgs.putDouble("y1", (b["y1"] as? Number)?.toDouble() ?: 0.0)
                bArgs.putDouble("x2", (b["x2"] as? Number)?.toDouble() ?: 0.0)
                bArgs.putDouble("y2", (b["y2"] as? Number)?.toDouble() ?: 0.0)
                args.putMap("bbox", bArgs)
            }

            (map["charBboxes"] as? ArrayList<*>)?.let { chars ->
                val cArgs = Arguments.createArray()
                for (item in chars) {
                    (item as? HashMap<*, *>)?.let { cm ->
                        val cmArgs = Arguments.createMap()
                        cmArgs.putDouble("x1", (cm["x1"] as? Number)?.toDouble() ?: 0.0)
                        cmArgs.putDouble("y1", (cm["y1"] as? Number)?.toDouble() ?: 0.0)
                        cmArgs.putDouble("x2", (cm["x2"] as? Number)?.toDouble() ?: 0.0)
                        cmArgs.putDouble("y2", (cm["y2"] as? Number)?.toDouble() ?: 0.0)
                        cmArgs.putString("char", cm["char"] as? String ?: "?")
                        cArgs.pushMap(cmArgs)
                    }
                }
                args.putArray("charBboxes", cArgs)
            }

            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("LPR_RESULT", args)
        } catch (e: Exception) {
            Log.d(TAG, "emitResult failed: ${e.message}")
        }
    }

    private val LPR_CHARS = arrayOf(
        "1", "2", "3", "4", "5", "6", "7", "8", "9",
        "A", "B", "C", "D", "E", "F", "G", "H", "K",
        "L", "M", "N", "P", "S", "T", "U", "V", "X", "Y", "Z",
        "0"
    )
}
