package com.smartparkingapp

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.util.Log
import androidx.work.*
import com.facebook.react.bridge.*
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import kotlinx.coroutines.*
import java.util.concurrent.TimeUnit
import java.io.File

class DatabaseModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context), ActivityEventListener {

    override fun getName() = "DatabaseModule"

    private val moduleScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val db by lazy { DatabaseHelper(reactApplicationContext) }
    private val prefs by lazy {
        reactApplicationContext.getSharedPreferences("session", Context.MODE_PRIVATE)
    }

    companion object {
        private const val SAVE_FILE_REQUEST_CODE = 1001
    }

    private var saveFilePending: Promise? = null
    private var saveFilePath: String? = null

    init {
        SupabaseApi.setCacheDir(reactApplicationContext.cacheDir)
        reactApplicationContext.addActivityEventListener(this)
        // Sync được kích hoạt event-driven (NetInfo reconnect + AppState foreground + boot),
        // không cần periodic poll để tránh device wake.
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        moduleScope.cancel()
    }

    private fun saveSession(id: Long, email: String, jwt: String) {
        prefs.edit().apply {
            putLong("id", id)
            putString("email", email)
            putString("fullName", email)
            putString("jwt", jwt)
            apply()
        }
    }

    private fun loadJwt(): String? = prefs.getString("jwt", null)

    private fun loadLocalId(): Long = prefs.getLong("id", -1L)

    private fun persistImage(sourcePath: String?): String? {
        if (sourcePath == null) return null
        val cleanPath = sourcePath.removePrefix("file://")
        val srcFile = File(cleanPath)
        if (!srcFile.exists()) return null
        val destDir = File(reactApplicationContext.filesDir, "plate_images")
        destDir.mkdirs()
        val destFile = File(destDir, "plate_${System.currentTimeMillis()}_${srcFile.name}")
        return try {
            srcFile.copyTo(destFile, overwrite = true)
            LogBuffer.add("[DB] persistImage: $cleanPath → ${destFile.absolutePath}")
            destFile.absolutePath
        } catch (e: Exception) {
            LogBuffer.add("[DB] persistImage failed: ${e.message}")
            sourcePath
        }
    }

    @ReactMethod
    fun persistImage(sourcePath: String, promise: Promise) {
        moduleScope.launch {
            try {
                val result = persistImage(sourcePath)
                if (result != null) {
                    promise.resolve("file://$result")
                } else {
                    promise.resolve(sourcePath)
                }
            } catch (e: Exception) {
                promise.resolve(sourcePath)
            }
        }
    }

    @ReactMethod
    fun persistFrame(sourcePath: String, frameId: String, promise: Promise) {
        moduleScope.launch {
            try {
                val cleanPath = sourcePath.removePrefix("file://")
                val srcFile = File(cleanPath)
                if (!srcFile.exists()) { promise.resolve(sourcePath); return@launch }
                val destDir = File(reactApplicationContext.filesDir, "plate_images")
                destDir.mkdirs()
                val destFile = File(destDir, "frame_${frameId}.jpg")
                srcFile.copyTo(destFile, overwrite = true)
                promise.resolve("file://${destFile.absolutePath}")
            } catch (e: Exception) {
                promise.resolve(sourcePath)
            }
        }
    }

    @ReactMethod
    fun markFrameValid(frameId: String, plate: String, promise: Promise) {
        moduleScope.launch {
            try {
                val dir = File(reactApplicationContext.filesDir, "plate_images")
                val frameFile = File(dir, "frame_${frameId}.jpg")
                if (!frameFile.exists()) { promise.resolve(null); return@launch }
                val validFile = File(dir, "valid_${plate}_${System.currentTimeMillis()}.jpg")
                frameFile.renameTo(validFile)
                promise.resolve("file://${validFile.absolutePath}")
            } catch (e: Exception) {
                promise.resolve(null)
            }
        }
    }

    @ReactMethod
    fun clearFrame(frameId: String, promise: Promise) {
        moduleScope.launch {
            try {
                val dir = File(reactApplicationContext.filesDir, "plate_images")
                val frameFile = File(dir, "frame_${frameId}.jpg")
                if (frameFile.exists()) frameFile.delete()
                promise.resolve(true)
            } catch (e: Exception) {
                promise.resolve(true)
            }
        }
    }

    private fun enqueueSync() {
        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build()
            )
            .build()
        WorkManager.getInstance(reactApplicationContext)
            .enqueueUniqueWork("sync_immediate", ExistingWorkPolicy.REPLACE, request)
    }

    private suspend fun refreshJwtIfNeeded(): String? {
        val localId = loadLocalId()
        if (localId == -1L) return null
        val att = db.getAttendantById(localId) ?: return null
        val refreshToken = att.refreshToken ?: return null
        val api = SupabaseApi()
        val result = api.refreshToken(refreshToken) ?: return null
        db.updateJwtAndRefresh(localId, result.jwt, result.refreshToken)
        saveSession(localId, att.email, result.jwt)
        LogBuffer.add("[DB] JWT refreshed for ${att.email}")
        return result.jwt
    }

    private suspend fun <T> withJwtRefresh(block: suspend (jwt: String) -> T?): T? {
        val jwt = loadJwt() ?: return null
        val result = block(jwt)
        if (result != null) return result
        val newJwt = refreshJwtIfNeeded()
        if (newJwt != null) return block(newJwt)
        return null
    }

    // ── Register ──

    @ReactMethod
    fun registerAttendant(email: String, password: String, promise: Promise) {
        moduleScope.launch {
            try {
                if (!isConnected()) {
                    withContext(Dispatchers.Main) {
                        promise.reject("NO_NETWORK", "Không có kết nối mạng. Vui lòng thử lại sau.")
                    }
                    return@launch
                }
                val api = SupabaseApi()
                val auth = api.signUp(email, password)
                if (auth == null) {
                    withContext(Dispatchers.Main) {
                        promise.reject("EMAIL_EXISTS", "Email đã tồn tại trên hệ thống, vui lòng đăng nhập")
                    }
                    return@launch
                }
                if (db.isEmailTaken(email)) {
                    db.deleteAttendantByEmail(email)
                }
                val passwordHash = DatabaseHelper.sha256(password)
                val localId = db.insertAttendantFull(auth.uid, email, passwordHash, auth.jwt, auth.refreshToken)
                LogBuffer.add("[DB] registerAttendant: $email -> localId=$localId uid=${auth.uid}")

                val apiAuth = SupabaseApi(auth.jwt)
                val serverId = apiAuth.pushAttendant(auth.uid, email)
                if (serverId != null) {
                    db.markAttendantSyncedWithServerId(localId, serverId)
                } else {
                    LogBuffer.add("[DB] pushAttendant failed — rolling back local insert")
                    db.deleteAttendantAndLogs(localId)
                    withContext(Dispatchers.Main) {
                        promise.reject("PUSH_FAILED", "Không thể đồng bộ tài khoản lên máy chủ, vui lòng thử lại")
                    }
                    return@launch
                }
                saveSession(localId, email, auth.jwt)
                val map = Arguments.createMap()
                map.putDouble("id", localId.toDouble())
                map.putString("fullName", email)
                withContext(Dispatchers.Main) { promise.resolve(map) }
            } catch (e: Exception) {
                LogBuffer.add("[DB] register EXCEPTION: ${e.message}")
                android.util.Log.e("DB", "register exception", e)
                withContext(Dispatchers.Main) { promise.reject("DB_ERROR", e.message) }
            }
        }
    }

    // ── Login ──

    private fun isConnected(): Boolean {
        return try {
            val cm = reactApplicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val network = cm.activeNetwork ?: return false
            val caps = cm.getNetworkCapabilities(network) ?: return false
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        } catch (e: Exception) { false }
    }

    @ReactMethod
    fun loginAttendant(email: String, password: String, promise: Promise) {
        moduleScope.launch {
            try {
                val local = db.getAttendantByEmail(email)
                // Nếu offline → vào thẳng offline fallback
                if (!isConnected()) {
                    LogBuffer.add("[DB] Offline login attempt: $email")
                    if (local == null) {
                        withContext(Dispatchers.Main) { promise.reject("EMAIL_NOT_FOUND", "Email không tồn tại trong hệ thống") }
                        return@launch
                    }
                    val inputHash = DatabaseHelper.sha256(password)
                    if (inputHash != local.passwordHash) {
                        withContext(Dispatchers.Main) { promise.reject("AUTH_FAILED", "Mật khẩu không đúng") }
                        return@launch
                    }
                    val storedJwt = local.jwtToken ?: run {
                        withContext(Dispatchers.Main) { promise.reject("AUTH_FAILED", "Vui lòng đăng nhập khi có kết nối mạng") }
                        return@launch
                    }
                    LogBuffer.add("[DB] Offline login OK: $email")
                    saveSession(local.id, local.email, storedJwt)
                    val map = Arguments.createMap()
                    map.putDouble("id", local.id.toDouble())
                    map.putString("fullName", local.email)
                    withContext(Dispatchers.Main) { promise.resolve(map) }
                    return@launch
                }

                val api = SupabaseApi()
                val auth = api.signIn(email, password)
                if (auth != null) {
                    LogBuffer.add("[DB] Authenticated: $email uid=${auth.uid}")
                    val apiAuth = SupabaseApi(auth.jwt)
                    val remote = apiAuth.fetchMyAttendant(auth.uid)
                    val localId: Long
                    if (remote != null) {
                        val sid = remote.serverId ?: run {
                            withContext(Dispatchers.Main) { promise.reject("DB_ERROR", "Dữ liệu nhân viên không hợp lệ từ máy chủ") }
                            return@launch
                        }
                        localId = db.upsertAttendantFromServer(sid, remote.uid, remote.email)
                    } else {
                        localId = db.insertAttendant(auth.uid, email)
                        val serverId = apiAuth.pushAttendant(auth.uid, email)
                        if (serverId != null) {
                            db.markAttendantSyncedWithServerId(localId, serverId)
                        } else {
                            enqueueSync()
                        }
                    }
                    val passwordHash = DatabaseHelper.sha256(password)
                    db.updatePasswordHash(localId, passwordHash)
                    db.updateJwtAndRefresh(localId, auth.jwt, auth.refreshToken)
                    saveSession(localId, remote?.email ?: email, auth.jwt)
                    val map = Arguments.createMap()
                    map.putDouble("id", localId.toDouble())
                    map.putString("fullName", remote?.email ?: email)
                    withContext(Dispatchers.Main) { promise.resolve(map) }
                    return@launch
                }

                // Online login failed (connected == true)
                if (local == null) {
                    withContext(Dispatchers.Main) { promise.reject("EMAIL_NOT_FOUND", "Email không tồn tại trong hệ thống") }
                    return@launch
                }
                // Check if auth user was deleted remotely
                val uid = local.uid
                val jwt = local.jwtToken
                val authUserExists = if (uid.isNotBlank() && jwt != null) {
                    SupabaseApi(jwt).fetchAuthUser()
                } else { true }
                if (!authUserExists) {
                    LogBuffer.add("[DB] Login: $email has local record but auth user deleted — cleaning up")
                    db.deleteAttendantAndLogs(local.id)
                    withContext(Dispatchers.Main) { promise.reject("ACCOUNT_DELETED", "Tài khoản đã bị xoá khỏi máy chủ, vui lòng đăng ký lại") }
                    return@launch
                }
                withContext(Dispatchers.Main) { promise.reject("AUTH_FAILED", "Mật khẩu không đúng") }
            } catch (e: Exception) {
                Log.e("DB", "login error", e)
                withContext(Dispatchers.Main) { promise.reject("DB_ERROR", e.message ?: "Đã có lỗi xảy ra") }
            }
        }
    }

    // ── Session ──

    @ReactMethod
    fun getSession(promise: Promise) {
        try {
            val id = prefs.getLong("id", -1L)
            if (id == -1L) {
                promise.resolve(null)
                return
            }
            val map = Arguments.createMap()
            map.putDouble("id", id.toDouble())
            map.putString("fullName", prefs.getString("fullName", "") ?: "")
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("DB_ERROR", e.message)
        }
    }

    @ReactMethod
    fun logout(promise: Promise) {
        try {
            // Cleanup local trước
            val activeSession = db.getActiveSession()
            if (activeSession != null) {
                db.endSession(activeSession.id)
                LogBuffer.add("[DB] Active session ended on logout: ${activeSession.name}")
            }
            prefs.edit().clear().apply()
            // Fire-and-forget signOut (không block)
            val jwt = loadJwt()
            if (jwt != null) {
                try { SupabaseApi(jwt).signOut() } catch (_: Exception) {}
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DB_ERROR", e.message)
        }
    }

    @ReactMethod
    fun deleteAccount(promise: Promise) {
        moduleScope.launch {
            try {
                val localId = loadLocalId()
                val att = if (localId != -1L) db.getAttendantById(localId) else null
                val serverId = att?.serverId
                val uid = att?.uid
                val jwt = loadJwt()

                if (uid != null && serverId != null && jwt != null) {
                    // 1. Edge function FIRST — deletes auth.user + public data + storage
                    val api = SupabaseApi(jwt)
                    val fnOk = api.deleteAccountViaFunction(uid, serverId)
                    if (!fnOk) {
                        LogBuffer.add("[DB] deleteAccount: edge function failed — keeping local data for retry")
                        withContext(Dispatchers.Main) {
                            promise.reject("DELETE_FAILED", "Không thể xoá tài khoản trên máy chủ, vui lòng thử lại")
                        }
                        return@launch
                    }
                }

                // 2. Edge function succeeded (or no remote data to delete) → clear local
                if (localId != -1L) {
                    db.deleteAttendantAndLogs(localId)
                    LogBuffer.add("[DB] Local data deleted for attendant $localId")
                }
                prefs.edit().clear().apply()
                if (jwt != null) { SupabaseApi(jwt).signOut() }

                LogBuffer.add("[DB] Account deleted successfully")
                withContext(Dispatchers.Main) { promise.resolve(true) }
            } catch (e: Exception) {
                LogBuffer.add("[DB] deleteAccount exception: ${e.message}")
                prefs.edit().clear().apply()
                withContext(Dispatchers.Main) { promise.resolve(true) }
            }
        }
    }

    @ReactMethod
    fun getAttendantById(id: Double, promise: Promise) {
        try {
            val attendant = db.getAttendantById(id.toLong())
            if (attendant != null) {
                val map = Arguments.createMap()
                map.putDouble("id", attendant.id.toDouble())
                map.putString("email", attendant.email)
                map.putString("fullName", attendant.email)
                promise.resolve(map)
            } else {
                promise.reject("NOT_FOUND", "Attendant not found")
            }
        } catch (e: Exception) {
            promise.reject("DB_ERROR", e.message)
        }
    }

    // ── Session ──

    @ReactMethod
    fun getActiveSession(promise: Promise) {
        try {
            val sess = db.getActiveSession()
            if (sess == null) {
                promise.resolve(null)
                return
            }
            val map = Arguments.createMap()
            map.putDouble("id", sess.id.toDouble())
            map.putString("name", sess.name)
            map.putString("status", sess.status)
            map.putString("createdAt", sess.createdAt)
            if (sess.endedAt != null) map.putString("endedAt", sess.endedAt)
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("DB_ERROR", e.message)
        }
    }

    @ReactMethod
    fun createSession(name: String, promise: Promise) {
        try {
            val localId = loadLocalId()
            if (localId == -1L) {
                promise.reject("NO_ATTENDANT", "No logged in attendant")
                return
            }
            val id = db.createSession(name, localId)
            val sess = db.getSessionById(id)
            if (sess == null) {
                promise.reject("DB_ERROR", "Failed to create session")
                return
            }
            enqueueSync()
            val map = Arguments.createMap()
            map.putDouble("id", sess.id.toDouble())
            map.putString("name", sess.name)
            map.putString("status", sess.status)
            map.putString("createdAt", sess.createdAt)
            if (sess.endedAt != null) map.putString("endedAt", sess.endedAt)
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("DB_ERROR", e.message)
        }
    }

    @ReactMethod
    fun endSession(sessionId: Double, promise: Promise) {
        try {
            val sid = sessionId.toLong()
            val remaining = db.getRemainingCount(sid)
            db.endSession(sid)
            enqueueSync()
            val map = Arguments.createMap()
            map.putBoolean("ended", true)
            map.putInt("remaining", remaining)
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("DB_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getRemainingCount(sessionId: Double, promise: Promise) {
        try {
            val count = db.getRemainingCount(sessionId.toLong())
            promise.resolve(count)
        } catch (e: Exception) {
            promise.reject("DB_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getAllSessions(promise: Promise) {
        try {
            val localId = loadLocalId()
            val sessions = if (localId == -1L) emptyList() else db.getAllSessionsForAttendant(localId)
            val array = Arguments.createArray()
            for (s in sessions) {
                val map = Arguments.createMap()
                map.putDouble("id", s.id.toDouble())
                map.putString("name", s.name)
                map.putString("status", s.status)
                map.putString("createdAt", s.createdAt)
                if (s.endedAt != null) map.putString("endedAt", s.endedAt)
                array.pushMap(map)
            }
            promise.resolve(array)
        } catch (e: Exception) {
            promise.reject("DB_ERROR", e.message)
        }
    }

    // ── Entry / Exit ──

    @ReactMethod
    fun recordEntry(licensePlate: String, sessionId: Double, promise: Promise) {
        try {
            val id = db.recordEntry(licensePlate, sessionId.toLong())
            enqueueSync()
            val map = Arguments.createMap()
            map.putDouble("id", id.toDouble())
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("DB_ERROR", e.message)
        }
    }

    @ReactMethod
    fun recordEntryWithTimestamp(licensePlate: String, sessionId: Double, timestamp: String, promise: Promise) {
        try {
            val id = db.recordEntry(licensePlate, sessionId.toLong(), timestamp)
            enqueueSync()
            val map = Arguments.createMap()
            map.putDouble("id", id.toDouble())
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("DB_ERROR", e.message)
        }
    }

    @ReactMethod
    fun recordEntryFull(licensePlate: String, timestamp: String, entryImage: String?, sessionId: Double, promise: Promise) {
        moduleScope.launch {
            try {
                val sid = sessionId.toLong()
                val persistentPath = persistImage(entryImage)
                val id = db.recordEntry(licensePlate, sid, timestamp, persistentPath)
                LogBuffer.add("[DB] Entry inserted local: $licensePlate -> id=$id")
                enqueueSync()
                val map = Arguments.createMap()
                map.putDouble("id", id.toDouble())
                withContext(Dispatchers.Main) { promise.resolve(map) }
            } catch (e: Exception) {
                LogBuffer.add("[DB] recordEntryFull error: ${e.message}")
                withContext(Dispatchers.Main) { promise.reject("DB_ERROR", e.message) }
            }
        }
    }

    @ReactMethod
    fun recordExit(licensePlate: String, promise: Promise) {
        try {
            val rows = db.recordExit(licensePlate)
            if (rows > 0) {
                enqueueSync()
                promise.resolve(rows)
            } else {
                promise.reject("NOT_FOUND", "No active entry found for this plate")
            }
        } catch (e: Exception) {
            promise.reject("DB_ERROR", e.message)
        }
    }

    @ReactMethod
    fun recordExitFull(licensePlate: String, exitImage: String?, promise: Promise) {
        moduleScope.launch {
            try {
                val persistentPath = persistImage(exitImage)
                val rows = db.recordExit(licensePlate, persistentPath)
                LogBuffer.add("[DB] Exit local: $licensePlate rows=$rows")
                if (rows == 0) {
                    withContext(Dispatchers.Main) { promise.reject("NOT_FOUND", "No active entry found for this plate") }
                    return@launch
                }
                enqueueSync()
                withContext(Dispatchers.Main) { promise.resolve(rows) }
            } catch (e: Exception) {
                LogBuffer.add("[DB] recordExitFull error: ${e.message}")
                withContext(Dispatchers.Main) { promise.reject("DB_ERROR", e.message) }
            }
        }
    }

    @ReactMethod
    fun getParkingLogsBySession(sessionId: Double, promise: Promise) {
        try {
            val logs = db.getParkingLogsBySession(sessionId.toLong())
            val array = Arguments.createArray()
            for (log in logs) {
                val map = Arguments.createMap()
                map.putDouble("id", log.id.toDouble())
                map.putString("licensePlate", log.licensePlate)
                map.putString("timeIn", log.timeIn)
                if (log.timeOut != null) map.putString("timeOut", log.timeOut)
                map.putDouble("sessionId", log.sessionId.toDouble())
                if (log.entryImage != null) map.putString("entryImage", log.entryImage)
                if (log.exitImage != null) map.putString("exitImage", log.exitImage)
                map.putInt("fee", log.fee)
                array.pushMap(map)
            }
            promise.resolve(array)
        } catch (e: Exception) {
            promise.reject("DB_ERROR", e.message)
        }
    }

    // ── Queries ──

    @ReactMethod
    fun getCurrentlyParked(promise: Promise) {
        try {
            val logs = db.getCurrentlyParkedLogs()
            val array = Arguments.createArray()
            for (log in logs) {
                val map = Arguments.createMap()
                map.putDouble("id", log.id.toDouble())
                map.putString("licensePlate", log.licensePlate)
                map.putString("timeIn", log.timeIn)
                map.putDouble("sessionId", log.sessionId.toDouble())
                if (log.entryImage != null) map.putString("entryImage", log.entryImage)
                array.pushMap(map)
            }
            promise.resolve(array)
        } catch (e: Exception) {
            promise.reject("DB_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getTodayStats(sessionId: Double?, promise: Promise) {
        try {
            val stats = db.getTodayStats(sessionId?.toLong())
            val map = Arguments.createMap()
            map.putInt("entryCount", stats.entryCount)
            map.putInt("exitCount", stats.exitCount)
            map.putInt("parkedCount", stats.parkedCount)
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("DB_ERROR", e.message)
        }
    }

    @ReactMethod
    fun searchParkingLogs(query: String?, onlyParked: String?, onlyExited: String?, sessionId: Double?, offset: Double, limit: Double, promise: Promise) {
        try {
            val logs = db.searchParkingLogs(
                query = query,
                onlyParked = onlyParked == "true",
                onlyExited = onlyExited == "true",
                sessionId = if (sessionId != null && sessionId > 0) sessionId.toLong() else null,
                offset = offset.toInt(),
                limit = limit.toInt()
            )
            val array = Arguments.createArray()
            for (log in logs) {
                val map = Arguments.createMap()
                map.putDouble("id", log.id.toDouble())
                map.putString("licensePlate", log.licensePlate)
                map.putString("timeIn", log.timeIn)
                if (log.timeOut != null) map.putString("timeOut", log.timeOut)
                map.putDouble("sessionId", log.sessionId.toDouble())
                if (log.entryImage != null) map.putString("entryImage", log.entryImage)
                if (log.exitImage != null) map.putString("exitImage", log.exitImage)
                map.putInt("fee", log.fee)
                array.pushMap(map)
            }
            promise.resolve(array)
        } catch (e: Exception) {
            promise.reject("DB_ERROR", e.message)
        }
    }

    // ── Debug ──

    @ReactMethod
    fun dumpDatabase(promise: Promise) {
        try {
            promise.resolve(db.dumpAllTables())
        } catch (e: Exception) {
            promise.reject("DB_ERROR", e.message)
        }
    }

    @ReactMethod
    fun clearAllTables(promise: Promise) {
        try {
            db.clearAllTables()
            val jwt = loadJwt()
            if (jwt != null) SupabaseApi(jwt).signOut()
            prefs.edit().clear().apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DB_ERROR", e.message)
        }
    }

    @ReactMethod
    fun clearDebugLogs(promise: Promise) {
        try {
            LogBuffer.clear()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DB_ERROR", e.message)
        }
    }

    @ReactMethod
    fun verifySessionOnSupabase(promise: Promise) {
        moduleScope.launch {
            try {
                val localId = loadLocalId()
                if (localId == -1L) { withContext(Dispatchers.Main) { promise.resolve(false) }; return@launch }
                val att = db.getAttendantById(localId)
                if (att == null) { withContext(Dispatchers.Main) { promise.resolve(false) }; return@launch }
                // Nếu offline → trust local session, không verify
                if (!isConnected()) {
                    LogBuffer.add("[DB] verifySession: offline — trusting local session")
                    withContext(Dispatchers.Main) { promise.resolve(true) }
                    return@launch
                }
                val jwt = att.jwtToken ?: run { withContext(Dispatchers.Main) { promise.resolve(false) }; return@launch }
                val uid = att.uid
                if (uid.isBlank()) { withContext(Dispatchers.Main) { promise.resolve(false) }; return@launch }
                val api = SupabaseApi(jwt)

                val authOk = api.fetchAuthUser()
                if (!authOk) {
                    LogBuffer.add("[DB] verifySession: $uid NOT found in auth.users — account deleted remotely")
                    withContext(Dispatchers.Main) { promise.resolve(false) }
                    return@launch
                }

                LogBuffer.add("[DB] verifySession: $uid exists in auth.users")
                withContext(Dispatchers.Main) { promise.resolve(true) }
            } catch (e: Exception) {
                LogBuffer.add("[DB] verifySession network issue (allowing local session): ${e.message}")
                withContext(Dispatchers.Main) { promise.resolve(true) }
            }
        }
    }

    @ReactMethod
    fun sendResetCode(email: String, promise: Promise) {
        moduleScope.launch {
            try {
                val api = SupabaseApi()
                val ok = api.sendResetCode(email)
                if (ok) {
                    LogBuffer.add("[DB] Reset code sent to $email")
                    withContext(Dispatchers.Main) { promise.resolve(true) }
                } else {
                    withContext(Dispatchers.Main) { promise.reject("NOT_FOUND", "Email không tồn tại trên hệ thống") }
                }
            } catch (e: Exception) {
                LogBuffer.add("[DB] sendResetCode exception: ${e.message}")
                withContext(Dispatchers.Main) { promise.reject("RESET_FAILED", e.message) }
            }
        }
    }

    @ReactMethod
    fun verifyResetCode(email: String, code: String, newPassword: String, promise: Promise) {
        moduleScope.launch {
            try {
                val api = SupabaseApi()
                val ok = api.verifyResetCode(email, code, newPassword)
                if (ok) {
                    LogBuffer.add("[DB] verifyResetCode OK for $email hasPassword=${newPassword.isNotEmpty()}")
                    if (newPassword.isNotEmpty()) {
                        prefs.edit().clear().apply()
                        LogBuffer.add("[DB] Session cleared after password reset")
                    }
                    withContext(Dispatchers.Main) { promise.resolve(true) }
                } else {
                    withContext(Dispatchers.Main) { promise.reject("RESET_FAILED", "Mã xác thực không đúng hoặc đã hết hạn") }
                }
            } catch (e: Exception) {
                LogBuffer.add("[DB] verifyResetCode exception: ${e.message}")
                withContext(Dispatchers.Main) { promise.reject("RESET_FAILED", e.message) }
            }
        }
    }

    @ReactMethod
    fun checkEmail(email: String, promise: Promise) {
        try {
            promise.resolve(db.isEmailTaken(email))
        } catch (e: Exception) {
            promise.reject("DB_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getDebugLogs(count: Double, promise: Promise) {
        try {
            val logs = LogBuffer.getLast(count.toInt())
            val array = Arguments.createArray()
            for (log in logs) array.pushString(log)
            promise.resolve(array)
        } catch (e: Exception) {
            promise.reject("DB_ERROR", e.message)
        }
    }

    @ReactMethod
    fun isOnline(promise: Promise) {
        try {
            val cm = reactApplicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val network = cm.activeNetwork ?: run { promise.resolve(false); return }
            val caps = cm.getNetworkCapabilities(network) ?: run { promise.resolve(false); return }
            val online = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            promise.resolve(online)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun triggerSync(promise: Promise) {
        try {
            val workRequest = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .build()
            WorkManager.getInstance(reactApplicationContext)
                .enqueueUniqueWork("sync_now", ExistingWorkPolicy.REPLACE, workRequest)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DB_ERROR", e.message)
        }
    }

    @ReactMethod
    fun triggerFullSync(promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences("sync", Context.MODE_PRIVATE)
            prefs.edit().remove("last_sync_timestamp").apply()
            val workRequest = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .build()
            WorkManager.getInstance(reactApplicationContext)
                .enqueueUniqueWork("sync_now", ExistingWorkPolicy.REPLACE, workRequest)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DB_ERROR", e.message)
        }
    }

    // ── Debug SQL ──

    @ReactMethod
    fun executeSql(sql: String, promise: Promise) {
        try {
            val rdb = db.readableDatabase
            val cursor = rdb.rawQuery(sql, null)
            val rows = Arguments.createArray()
            while (cursor.moveToNext()) {
                val row = Arguments.createMap()
                for (i in 0 until cursor.columnCount) {
                    val colName = cursor.getColumnName(i)
                    when (cursor.getType(i)) {
                        Cursor.FIELD_TYPE_NULL -> row.putNull(colName)
                        Cursor.FIELD_TYPE_INTEGER -> row.putDouble(colName, cursor.getLong(i).toDouble())
                        Cursor.FIELD_TYPE_FLOAT -> row.putDouble(colName, cursor.getDouble(i))
                        Cursor.FIELD_TYPE_STRING -> row.putString(colName, cursor.getString(i) ?: "")
                        Cursor.FIELD_TYPE_BLOB -> row.putString(colName, "<blob>")
                    }
                }
                rows.pushMap(row)
            }
            cursor.close()
            promise.resolve(rows)
        } catch (e: Exception) {
            promise.reject("DB_ERROR", e.message)
        }
    }

    // ── Debug Supabase ──

    @ReactMethod
    fun deleteSupabaseTable(tableName: String, promise: Promise) {
        moduleScope.launch {
            try {
                val jwt = loadJwt()
                if (jwt == null) {
                    LogBuffer.add("[DB] deleteSupabaseTable($tableName): no JWT")
                    withContext(Dispatchers.Main) { promise.resolve(false) }
                    return@launch
                }
                val api = SupabaseApi(jwt)
                val ok = api.deleteAllRows(tableName)
                LogBuffer.add("[DB] deleteSupabaseTable($tableName): ok=$ok")
                withContext(Dispatchers.Main) { promise.resolve(ok) }
            } catch (e: Exception) {
                LogBuffer.add("[DB] deleteSupabaseTable exception: ${e.message}")
                withContext(Dispatchers.Main) { promise.resolve(false) }
            }
        }
    }

    @ReactMethod
    fun deleteAllSupabaseTables(promise: Promise) {
        moduleScope.launch {
            try {
                val jwt = loadJwt()
                if (jwt == null) {
                    LogBuffer.add("[DB] deleteAllSupabaseTables: no JWT")
                    withContext(Dispatchers.Main) { promise.resolve(false) }
                    return@launch
                }
                val api = SupabaseApi(jwt)
                val ok = api.deleteAllRows("", tables = listOf("attendants", "sessions", "parking_logs"))
                LogBuffer.add("[DB] deleteAllSupabaseTables: ok=$ok")
                withContext(Dispatchers.Main) { promise.resolve(ok) }
            } catch (e: Exception) {
                LogBuffer.add("[DB] deleteAllSupabaseTables exception: ${e.message}")
                withContext(Dispatchers.Main) { promise.resolve(false) }
            }
        }
    }

    @ReactMethod
    fun clearTable(tableName: String, promise: Promise) {
        try {
            db.clearTable(tableName)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DB_ERROR", e.message)
        }
    }

    @ReactMethod
    fun fetchSupabaseTable(tableName: String, promise: Promise) {
        moduleScope.launch {
            try {
                val result = withJwtRefresh { jwt ->
                    val api = SupabaseApi(jwt)
                    api.fetchTable(tableName)
                }
                if (result == null) {
                    LogBuffer.add("[DB] fetchSupabaseTable($tableName): no JWT or fetch failed")
                    withContext(Dispatchers.Main) { promise.reject("NO_AUTH", "Không thể xác thực với Supabase") }
                    return@launch
                }
                val arr = result as JsonArray
                val rows = Arguments.createArray()
                for (elem in arr) {
                    val obj = elem.asJsonObject
                    val row = Arguments.createMap()
                    for (key in obj.keySet()) {
                        val el = obj.get(key)
                        when {
                            el == null || el.isJsonNull -> row.putNull(key)
                            el.isJsonPrimitive -> {
                                val prim = el.asJsonPrimitive
                                when {
                                    prim.isNumber -> row.putDouble(key, prim.asDouble)
                                    prim.isBoolean -> row.putBoolean(key, prim.asBoolean)
                                    else -> row.putString(key, prim.asString)
                                }
                            }
                            else -> row.putString(key, el.toString())
                        }
                    }
                    rows.pushMap(row)
                }
                withContext(Dispatchers.Main) { promise.resolve(rows) }
            } catch (e: Exception) {
                LogBuffer.add("[DB] fetchSupabaseTable exception: ${e.message}")
                withContext(Dispatchers.Main) { promise.reject("DB_ERROR", e.message) }
            }
        }
    }

    @ReactMethod
    fun saveFile(srcPath: String, mimeType: String, defaultName: String, promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "Không tìm thấy Activity")
            return
        }
        val srcFile = File(srcPath)
        if (!srcFile.exists()) {
            promise.reject("FILE_NOT_FOUND", "File nguồn không tồn tại")
            return
        }
        saveFilePending = promise
        saveFilePath = srcPath
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = mimeType
            putExtra(Intent.EXTRA_TITLE, defaultName)
        }
        activity.startActivityForResult(intent, SAVE_FILE_REQUEST_CODE, null)
    }

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != SAVE_FILE_REQUEST_CODE) return

        val promise = saveFilePending
        saveFilePending = null
        val srcPath = saveFilePath
        saveFilePath = null

        if (resultCode != Activity.RESULT_OK || data?.data == null) {
            promise?.reject("CANCELLED", "Đã huỷ chọn vị trí lưu")
            return
        }

        moduleScope.launch {
            try {
                val uri = data.data!!
                reactApplicationContext.contentResolver.openOutputStream(uri)?.use { output ->
                    File(srcPath!!).inputStream().use { input ->
                        input.copyTo(output)
                    }
                }
                File(srcPath!!).delete()
                withContext(Dispatchers.Main) { promise?.resolve(true) }
            } catch (e: Exception) {
                LogBuffer.add("[DB] saveFile error: ${e.message}")
                withContext(Dispatchers.Main) { promise?.reject("SAVE_FAILED", e.message ?: "Lỗi khi lưu file") }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {}

    @ReactMethod
    fun addListener(eventName: String) {}
    @ReactMethod
    fun removeListeners(count: Int) {}
}
