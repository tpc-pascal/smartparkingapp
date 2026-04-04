package com.smartparkingapp

import android.content.Context
import android.media.ToneGenerator
import android.media.AudioManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SettingsModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

    override fun getName() = "SettingsModule"

    private val prefs by lazy {
        reactApplicationContext.getSharedPreferences("settings", Context.MODE_PRIVATE)
    }

    @ReactMethod
    fun getBool(key: String, promise: Promise) {
        try {
            promise.resolve(prefs.getBoolean(key, false))
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun setBool(key: String, value: Boolean, promise: Promise) {
        try {
            prefs.edit().putBoolean(key, value).apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun getString(key: String, promise: Promise) {
        try {
            promise.resolve(prefs.getString(key, null))
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun setString(key: String, value: String, promise: Promise) {
        try {
            prefs.edit().putString(key, value).apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun playBeep(volume: Double, promise: Promise) {
        try {
            val vol = volume.toInt().coerceIn(0, 100)
            val tone = ToneGenerator(AudioManager.STREAM_NOTIFICATION, vol)
            tone.startTone(ToneGenerator.TONE_PROP_NACK, 200)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun vibrate(duration: Double, promise: Promise) {
        try {
            val ctx = reactApplicationContext
            val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
                vm.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                ctx.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createOneShot(duration.toLong(), VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(duration.toLong())
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }
}
