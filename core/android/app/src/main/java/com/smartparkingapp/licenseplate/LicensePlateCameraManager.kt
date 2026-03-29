package com.smartparkingapp.licenseplate

import androidx.lifecycle.LifecycleOwner
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.common.MapBuilder
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class LicensePlateCameraManager : SimpleViewManager<LicensePlateCameraView>() {

    override fun getName() = "LicensePlateCamera"

    override fun createViewInstance(reactContext: ThemedReactContext): LicensePlateCameraView {
        val recognizer = LicensePlateRecognizer(reactContext)
        val view = LicensePlateCameraView(reactContext)
        view.setRecognizer(recognizer)

        tryStartCamera(reactContext, view)

        reactContext.addLifecycleEventListener(object : LifecycleEventListener {
            override fun onHostResume() {
                if (!view.isCameraActive()) {
                    tryStartCamera(reactContext, view)
                }
            }

            override fun onHostPause() {}

            override fun onHostDestroy() {
                view.cleanup()
            }
        })

        return view
    }

    private fun tryStartCamera(reactContext: ThemedReactContext, view: LicensePlateCameraView) {
        val activity = reactContext.currentActivity
        if (activity is LifecycleOwner) {
            view.startCamera(activity)
        }
    }

    @ReactProp(name = "zoom")
    fun setZoom(view: LicensePlateCameraView, zoom: Float) {
        view.setZoom(zoom)
    }

    override fun getCommandsMap(): MutableMap<String, Int> {
        return MapBuilder.of(
            "takeSnapshot", COMMAND_TAKE_SNAPSHOT,
            "resetSnapshot", COMMAND_RESET_SNAPSHOT
        )
    }

    override fun receiveCommand(root: LicensePlateCameraView, commandId: String, args: ReadableArray?) {
        when (commandId) {
            "takeSnapshot" -> root.takeSnapshot()
            "resetSnapshot" -> root.resetSnapshot()
        }
    }

    override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> {
        return MapBuilder.of(
            "onSnapshot", MapBuilder.of("registrationName", "onSnapshot"),
            "onPlateRecognized", MapBuilder.of("registrationName", "onPlateRecognized")
        )
    }

    override fun onDropViewInstance(view: LicensePlateCameraView) {
        super.onDropViewInstance(view)
        view.cleanup()
    }

    companion object {
        private const val COMMAND_TAKE_SNAPSHOT = 1
        private const val COMMAND_RESET_SNAPSHOT = 2
    }
}
