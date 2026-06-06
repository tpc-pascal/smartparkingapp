package com.smartparkingapp

import android.content.Context
import android.graphics.BitmapFactory
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*
import java.io.File

class LicensePlateModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

    override fun getName() = "LicensePlateModule"

    private val moduleScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    init {
        moduleScope.launch {
            try {
                LprDetector.initialize(reactApplicationContext)
                sendLog("LprDetector preloaded in background")
            } catch (e: Exception) {
                sendLog("Preload failed: ${e.message}")
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
        val t0 = System.currentTimeMillis()
        val cleanPath = imagePath.removePrefix("file://")
        LprDetector.initialize(reactApplicationContext)
        val tInit = System.currentTimeMillis() - t0

        val t1 = System.currentTimeMillis()
        val srcOpts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(cleanPath, srcOpts)
        val srcW = srcOpts.outWidth
        val sampleSize = if (srcW > 0) Integer.highestOneBit(srcW / 640).coerceAtLeast(1) else 2
        val opts = BitmapFactory.Options().apply { inSampleSize = sampleSize }
        val bitmap = BitmapFactory.decodeFile(cleanPath, opts)
            ?: run { sendLog("FAIL: cannot decode bitmap"); resolveUnknown(promise); return }
        val tDecode = System.currentTimeMillis() - t1
        sendLog("TIMING init=${tInit}ms decode=${tDecode}ms (${bitmap.width}x${bitmap.height}, sampleSize=$sampleSize)")

        try {
            val t2 = System.currentTimeMillis()
            val result = LprDetector.runFullPipeline(bitmap)
            val tInfer = System.currentTimeMillis() - t2
            sendLog("TIMING pre=${result.timingPreMs}ms LPD=${result.timingLpdMs}ms LPR=${result.timingLprMs}ms total_infer=${tInfer}ms plate=${result.plate}")
            val map = Arguments.createMap()
            map.putString("plate", result.plate)
            map.putInt("imageWidth", result.imageWidth)
            map.putInt("imageHeight", result.imageHeight)
            if (result.bbox != null) {
                val bbox = Arguments.createMap()
                bbox.putDouble("x1", result.bbox.x1.toDouble())
                bbox.putDouble("y1", result.bbox.y1.toDouble())
                bbox.putDouble("x2", result.bbox.x2.toDouble())
                bbox.putDouble("y2", result.bbox.y2.toDouble())
                map.putMap("bbox", bbox)
            }
            if (result.charBboxes.isNotEmpty()) {
                val charBboxes = Arguments.createArray()
                for (c in result.charBboxes) {
                    val cm = Arguments.createMap()
                    cm.putDouble("x1", c.x1.toDouble())
                    cm.putDouble("y1", c.y1.toDouble())
                    cm.putDouble("x2", c.x2.toDouble())
                    cm.putDouble("y2", c.y2.toDouble())
                    charBboxes.pushMap(cm)
                }
                map.putArray("charBboxes", charBboxes)
            }
            val tTotal = System.currentTimeMillis() - t0
            sendLog("TIMING TOTAL=${tTotal}ms plate=${result.plate} lpd=${result.timingLpdMs} lpr=${result.timingLprMs}")
            promise.resolve(map)
        } finally {
            bitmap.recycle()
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
