package com.smartparkingapp

import android.content.Context
import android.util.Base64
import java.security.SecureRandom
import java.util.concurrent.locks.ReentrantLock
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlin.concurrent.withLock

object CryptoHelper {
    private const val PREF_NAME = "nfc_crypto"
    private const val KEY_STORED = "aes_key"
    private const val IV_SIZE = 12
    private const val TAG_BIT_LENGTH = 128
    private const val KEY_SIZE = 256

    private var initialized = false
    private val lock = ReentrantLock()
    private lateinit var secretKey: SecretKeySpec

    fun init(context: Context) {
        if (initialized) return
        lock.withLock {
            if (initialized) return
            val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
            var keyBytes = prefs.getString(KEY_STORED, null)?.let { Base64.decode(it, Base64.DEFAULT) }
            if (keyBytes == null || keyBytes.size * 8 != KEY_SIZE) {
                val keyGen = KeyGenerator.getInstance("AES")
                keyGen.init(KEY_SIZE)
                keyBytes = keyGen.generateKey().encoded
                prefs.edit().putString(KEY_STORED, Base64.encodeToString(keyBytes, Base64.NO_WRAP)).apply()
            }
            secretKey = SecretKeySpec(keyBytes, "AES")
            initialized = true
        }
    }

    fun encrypt(plain: String): String {
        ensureInitialized()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val iv = ByteArray(IV_SIZE).apply { SecureRandom().nextBytes(this) }
        cipher.init(Cipher.ENCRYPT_MODE, secretKey, GCMParameterSpec(TAG_BIT_LENGTH, iv))
        val encrypted = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(iv + encrypted, Base64.NO_WRAP)
    }

    fun decrypt(encrypted: String): String {
        ensureInitialized()
        val raw = Base64.decode(encrypted, Base64.DEFAULT)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val iv = raw.copyOfRange(0, IV_SIZE)
        val data = raw.copyOfRange(IV_SIZE, raw.size)
        cipher.init(Cipher.DECRYPT_MODE, secretKey, GCMParameterSpec(TAG_BIT_LENGTH, iv))
        return String(cipher.doFinal(data), Charsets.UTF_8)
    }

    private fun ensureInitialized() {
        if (!initialized) throw IllegalStateException("CryptoHelper not initialized — call init(context) first")
    }
}
