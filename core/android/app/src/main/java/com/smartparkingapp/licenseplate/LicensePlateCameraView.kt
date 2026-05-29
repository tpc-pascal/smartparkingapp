package com.smartparkingapp.licenseplate

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.util.Log
import android.view.Gravity
import android.view.ScaleGestureDetector
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.ProgressBar
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.RCTEventEmitter
import java.nio.ByteBuffer
import java.util.concurrent.Executors

class LicensePlateCameraView(context: Context) : FrameLayout(context) {

    companion object {
        private const val TAG = "LPR_CameraView"
    }

    private var previewView: PreviewView
    private var freezeOverlay: ImageView
    private var loadingOverlay: ProgressBar
    private var imageCapture: ImageCapture? = null
    private var recognizer: LicensePlateRecognizer? = null
    private var cameraProvider: ProcessCameraProvider? = null
    private var lifecycleOwner: LifecycleOwner? = null
    private var currentZoom = 0f
    private var maxZoom = 1f
    private var isFrozen = false

    private val executor = Executors.newSingleThreadExecutor()
    private val mainExecutor = ContextCompat.getMainExecutor(context)

    init {
        previewView = PreviewView(context).apply {
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        }
        addView(previewView)

        freezeOverlay = ImageView(context).apply {
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
            scaleType = ImageView.ScaleType.CENTER_CROP
            visibility = View.GONE
        }
        addView(freezeOverlay)

        loadingOverlay = ProgressBar(context, null, android.R.attr.progressBarStyleLarge).apply {
            val lp = LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT)
            lp.gravity = Gravity.CENTER
            layoutParams = lp
            visibility = View.GONE
        }
        addView(loadingOverlay)

        setupPinchToZoom()
    }

    fun setRecognizer(rec: LicensePlateRecognizer) {
        recognizer = rec
    }

    fun isCameraActive(): Boolean = cameraProvider != null

    fun startCamera(owner: LifecycleOwner) {
        lifecycleOwner = owner
        val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
        cameraProviderFuture.addListener({
            cameraProvider = cameraProviderFuture.get()
            bindCamera()
        }, ContextCompat.getMainExecutor(context))
    }

    private fun bindCamera() {
        val owner = lifecycleOwner ?: return
        val provider = cameraProvider ?: return
        provider.unbindAll()

        val preview = Preview.Builder().build().also {
            it.surfaceProvider = previewView.surfaceProvider
        }

        imageCapture = ImageCapture.Builder()
            .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
            .setTargetRotation(previewView.display?.rotation ?: 0)
            .build()

        val cameraSelector = CameraSelector.Builder()
            .requireLensFacing(CameraSelector.LENS_FACING_BACK)
            .build()

        try {
            val camera = provider.bindToLifecycle(owner, cameraSelector, preview, imageCapture)
            val camInfo = camera.cameraInfo
            maxZoom = camInfo.zoomState.value?.maxZoomRatio ?: 1f
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun setupPinchToZoom() {
        val scaleDetector = ScaleGestureDetector(context, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
            override fun onScale(detector: ScaleGestureDetector): Boolean {
                currentZoom = (currentZoom * detector.scaleFactor).coerceIn(1f, maxZoom)
                return true
            }
        })

        setOnTouchListener { _, event ->
            scaleDetector.onTouchEvent(event)
            true
        }
    }

    fun setZoom(zoom: Float) {
        currentZoom = zoom.coerceIn(1f, maxZoom)
    }

    fun takeSnapshot() {
        Log.d(TAG, "takeSnapshot called, isFrozen=$isFrozen, imageCapture=${imageCapture != null}")
        if (isFrozen) return
        val capture = imageCapture ?: run {
            Log.e(TAG, "takeSnapshot: imageCapture is null, camera may not be ready")
            return
        }

        loadingOverlay.visibility = View.VISIBLE

        capture.takePicture(mainExecutor, object : ImageCapture.OnImageCapturedCallback() {
            override fun onCaptureSuccess(image: ImageProxy) {
                Log.d(TAG, "Image captured: ${image.width}x${image.height}, format=${image.format}")
                val bitmap = imageProxyToBitmap(image)
                image.close()

                if (bitmap != null) {
                    Log.d(TAG, "Bitmap decoded: ${bitmap.width}x${bitmap.height}, config=${bitmap.config}")
                    isFrozen = true
                    freezeOverlay.setImageBitmap(bitmap)
                    freezeOverlay.visibility = View.VISIBLE
                    loadingOverlay.visibility = View.GONE

                    executor.execute {
                        Log.d(TAG, "Starting plate recognition on background thread...")
                        val startTime = System.currentTimeMillis()
                        val result = recognizer?.recognizePlate(bitmap)
                        val elapsed = System.currentTimeMillis() - startTime
                        Log.d(TAG, "Recognition done in ${elapsed}ms: plate='${result?.plate}', success=${result?.success}, error=${result?.error}")
                        mainExecutor.execute {
                            result?.let {
                                onPlateRecognized(it.plate, it.success, it.error)
                            } ?: Log.e(TAG, "recognizer is null, cannot recognize plate")
                        }
                    }
                } else {
                    Log.e(TAG, "Bitmap conversion returned null! imageProxyToBitmap failed")
                    loadingOverlay.visibility = View.GONE
                }
            }

            override fun onError(exception: ImageCaptureException) {
                Log.e(TAG, "ImageCapture error: ${exception.message}", exception)
                loadingOverlay.visibility = View.GONE
                onPlateRecognized("", false, exception.message)
            }
        })
    }

    fun resetSnapshot() {
        isFrozen = false
        freezeOverlay.visibility = View.GONE
        freezeOverlay.setImageBitmap(null)
    }

    private fun imageProxyToBitmap(image: ImageProxy): Bitmap? {
        val planes = image.planes
        Log.d(TAG, "imageProxyToBitmap: ${planes.size} planes")
        if (planes.isEmpty()) {
            Log.e(TAG, "No planes in image proxy")
            return null
        }

        val buffer = planes[0].buffer
        val bytes = ByteArray(buffer.remaining())
        buffer.get(bytes)
        Log.d(TAG, "Plane[0] buffer size: ${bytes.size} bytes")
        val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        Log.d(TAG, "Decoded bitmap: ${bitmap?.width}x${bitmap?.height}, bitmap=${bitmap != null}")
        return bitmap
    }

    private fun onPlateRecognized(plate: String, success: Boolean, error: String?) {
        Log.d(TAG, "Sending event: plate='$plate', success=$success, error=$error")
        val event = Arguments.createMap()
        event.putString("plate", plate)
        event.putBoolean("success", success)
        if (error != null) event.putString("error", error)
        sendEvent("onPlateRecognized", event)
    }

    private fun sendEvent(eventName: String, params: WritableMap) {
        val reactContext = context as? ReactContext
        Log.d(TAG, "sendEvent: name=$eventName, reactContext=${reactContext != null}, viewId=$id")
        reactContext?.getJSModule(RCTEventEmitter::class.java)?.receiveEvent(id, eventName, params)
    }

    fun cleanup() {
        recognizer?.close()
        cameraProvider?.unbindAll()
    }
}
