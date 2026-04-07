package com.smartparkingapp

import android.app.Activity
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.Ndef
import android.nfc.tech.NfcA
import android.nfc.tech.MifareUltralight
import android.provider.Settings
import android.util.Log
import com.facebook.react.bridge.*

class NfcModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

    @Volatile private var pendingPromise: Promise? = null
    @Volatile private var pendingWriteText: String? = null
    @Volatile private var isReadMode: Boolean = false

    override fun getName() = "NfcModule"

    init {
        instance = this
        CryptoHelper.init(reactApplicationContext)
    }

    companion object {
        var instance: NfcModule? = null
            private set

        fun handleIntent(intent: Intent) {
            instance?.onNewIntent(intent)
        }
    }

    @ReactMethod
    fun isNfcSupported(promise: Promise) {
        try {
            promise.resolve(NfcAdapter.getDefaultAdapter(reactApplicationContext) != null)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun isNfcEnabled(promise: Promise) {
        try {
            val adapter = NfcAdapter.getDefaultAdapter(reactApplicationContext)
            promise.resolve(adapter != null && adapter.isEnabled)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun openNfcSettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_NFC_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("NFC_ERROR", e.message)
        }
    }

    @ReactMethod
    fun writeNdef(text: String, promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (!setupNfc(activity, promise)) return
        setPending(promise, text, false)
        sendEvent("NFC_TAG_WAITING", null)
    }

    @ReactMethod
    fun readNdef(promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (!setupNfc(activity, promise)) return
        setPending(promise, null, true)
        sendEvent("NFC_TAG_WAITING", null)
    }

    @ReactMethod
    fun cancelWrite(promise: Promise) {
        clearPending()
        val activity = reactApplicationContext.currentActivity
        if (activity != null) disableForegroundDispatch(activity)
        promise.resolve(true)
    }

    // ── Lifecycle ──

    fun onNewIntent(intent: Intent) {
        val promise = pendingPromise ?: run {
            Log.d("NFC", "onNewIntent with no pending promise")
            return
        }
        Log.d("NFC", "onNewIntent action=${intent.action} hasTag=${intent.hasExtra(NfcAdapter.EXTRA_TAG)}")
        val tag = intent.getParcelableExtra<Tag>(NfcAdapter.EXTRA_TAG) ?: run {
            promise.reject("NO_TAG", "Không tìm thấy thẻ NFC")
            clearPending()
            return
        }

        try {
            if (isReadMode) {
                val text = readNdefFromTag(tag)
                val decrypted = CryptoHelper.decrypt(text)
                promise.resolve(decrypted)
                sendEvent("NFC_TAG_READ", null)
            } else {
                val text = pendingWriteText ?: run {
                    promise.reject("NO_DATA", "Không có dữ liệu để ghi")
                    return
                }
                writeNdefToTag(tag, CryptoHelper.encrypt(text))
                promise.resolve(true)
                sendEvent("NFC_TAG_WRITTEN", null)
            }
        } catch (e: Exception) {
            Log.e("NFC", "tag error", e)
            promise.reject("NFC_FAILED", e.message ?: "Thao tác thẻ thất bại")
        } finally {
            clearPending()
            val activity = reactApplicationContext.currentActivity
            if (activity != null) disableForegroundDispatch(activity)
        }
    }

    // ── Internal ──

    private fun setupNfc(activity: Activity?, promise: Promise): Boolean {
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "Không có activity")
            return false
        }
        val adapter = NfcAdapter.getDefaultAdapter(reactApplicationContext)
        if (adapter == null) {
            promise.reject("NFC_NOT_SUPPORTED", "NFC không khả dụng")
            return false
        }
        if (!adapter.isEnabled) {
            promise.reject("NFC_DISABLED", "NFC đang tắt")
            return false
        }
        enableForegroundDispatch(activity)
        return true
    }

    private fun enableForegroundDispatch(activity: Activity) {
        val adapter = NfcAdapter.getDefaultAdapter(activity) ?: return
        val intent = Intent(activity, activity.javaClass).apply {
            addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        val pendingIntent = PendingIntent.getActivity(activity, 0, intent, flags)
        adapter.enableForegroundDispatch(activity, pendingIntent, null, null)
    }

    private fun disableForegroundDispatch(activity: Activity) {
        try {
            NfcAdapter.getDefaultAdapter(activity)?.disableForegroundDispatch(activity)
        } catch (_: Exception) {}
    }

    private fun readNdefFromTag(tag: Tag): String {
        val ndef = Ndef.get(tag) ?: throw Exception("Thẻ không hỗ trợ NDEF")
        ndef.connect()
        try {
            val msg = ndef.cachedNdefMessage ?: ndef.ndefMessage
            if (msg.records.isEmpty()) throw Exception("Thẻ không có dữ liệu")
            val record = msg.records[0]
            val payload = record.payload
            if (payload.isEmpty()) throw Exception("Thẻ không có dữ liệu")
            val langLen = payload[0].toInt() and 0x3F
            if (1 + langLen > payload.size) throw Exception("Dữ liệu thẻ không hợp lệ")
            val isUTF16 = payload[0].toInt() and 0x80 != 0
            val textBytes = payload.copyOfRange(1 + langLen, payload.size)
            return String(textBytes, if (isUTF16) Charsets.UTF_16 else Charsets.UTF_8)
        } finally {
            try { ndef.close() } catch (_: Exception) {}
        }
    }

    private fun writeNdefToTag(tag: Tag, text: String) {
        val ndef = Ndef.get(tag) ?: throw Exception("Thẻ không hỗ trợ NDEF")
        ndef.connect()
        try {
            val msg = NdefMessage(arrayOf(NdefRecord.createTextRecord("en", text)))
            if (ndef.maxSize < msg.toByteArray().size) {
                throw Exception("Bộ nhớ thẻ không đủ")
            }
            ndef.writeNdefMessage(msg)
        } finally {
            try { ndef.close() } catch (_: Exception) {}
        }
    }

    @Synchronized
    private fun clearPending() {
        pendingPromise = null
        pendingWriteText = null
        isReadMode = false
    }

    @Synchronized
    private fun setPending(promise: Promise, writeText: String?, readMode: Boolean) {
        pendingPromise = promise
        pendingWriteText = writeText
        isReadMode = readMode
    }

    private fun sendEvent(eventName: String, params: ReadableMap?) {
        reactApplicationContext
            .getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun addListener(eventName: String) {}
    @ReactMethod
    fun removeListeners(count: Int) {}
}
