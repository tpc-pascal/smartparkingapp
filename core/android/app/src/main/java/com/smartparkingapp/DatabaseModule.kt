package com.smartparkingapp

import android.content.Context
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

class DatabaseModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

    override fun getName() = "DatabaseModule"

    private val moduleScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val db by lazy { DatabaseHelper(reactApplicationContext) }
    private val prefs by lazy {
        reactApplicationContext.getSharedPreferences("session", Context.MODE_PRIVATE)
    }

    init {
        SupabaseApi.setCacheDir(reactApplicationContext.cacheDir)
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
        val periodicSync = PeriodicWorkRequestBuilder<SyncWorker>(2, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .build()
        WorkManager.getInstance(reactApplicationContext)
            .enqueueUniquePeriodicWork("sync_periodic", ExistingPeriodicWorkPolicy.KEEP, periodicSync)
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
                // 1. Check Supabase FIRST — account may have been deleted remotely
                //    while stale local record still exists
                val api = SupabaseApi()
                val auth = api.signUp(email, password)
                if (auth == null) {
                    withContext(Dispatchers.Main) {
                        promise.reject("EMAIL_EXISTS", "Email đã tồn tại trên hệ thống, vui lòng đăng nhập")
                    }
                    return@launch
                }

                // 2. SignUp succeeded → Supabase has no record of this email
                //    Clean up any stale local record from a previously deleted account
                if (db.isEmailTaken(email)) {
                    db.deleteAttendantByEmail(email)
                    LogBuffer.add("[DB] registerAttendant: removed stale local record for $email")
                }

                // 3. Fresh registration
                val passwordHash = DatabaseHelper.sha256(password)
                val localId = db.insertAttendantFull(auth.uid, email, passwordHash, auth.jwt, auth.refreshToken)
                LogBuffer.add("[DB] registerAttendant: $email -> localId=$localId uid=${auth.uid}")

                val apiAuth = SupabaseApi(auth.jwt)
                val serverId = apiAuth.pushAttendant(auth.uid, email)
                if (serverId != null) {
                    db.markAttendantSyncedWithServerId(localId, serverId)
                    LogBuffer.add("[DB] Attendant pushed: serverId=$serverId")
                } else {
                    // pushAttendant failed (e.g. unique constraint, RLS) — rollback local insert
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
                val api = SupabaseApi()
                val auth = api.signIn(email, password)
                if (auth != null) {
                    LogBuffer.add("[DB] Authenticated: $email uid=${auth.uid}")
                    val apiAuth = SupabaseApi(auth.jwt)
                    val remote = apiAuth.fetchMyAttendant(auth.uid)
                    val localId: Long
                    if (remote != null) {
                        localId = db.upsertAttendantFromServer(remote.serverId!!, remote.uid, remote.email)
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

                // Online login failed
                val connected = isConnected()
                val local = db.getAttendantByEmail(email)

                if (connected && local == null) {
                    withContext(Dispatchers.Main) { promise.reject("EMAIL_NOT_FOUND", "Email không tồn tại trong hệ thống") }
                    return@launch
                }
                if (connected && local != null) {
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
                    return@launch
                }

                // Offline fallback (no network)
                LogBuffer.add("[DB] Online login failed, trying offline...")
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
            val jwt = loadJwt()
            if (jwt != null) {
                SupabaseApi(jwt).signOut()
            }
            val activeSession = db.getActiveSession()
            if (activeSession != null) {
                db.endSession(activeSession.id)
                LogBuffer.add("[DB] Active session ended on logout: ${activeSession.name}")
            }
            prefs.edit().clear().apply()
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
                // 1. Ghi DB trước với local path
                val id = db.recordEntry(licensePlate, sid, timestamp, entryImage)
                LogBuffer.add("[DB] Entry inserted local: $licensePlate -> id=$id sid=$sid")

                // 2. Upload ảnh async (không block)
                if (entryImage != null) {
                    val sess = db.getSessionById(sid)
                    val att = if (sess != null) db.getAttendantById(sess.attendantId) else null
                    val uid = att?.uid ?: "unknown"
                    val remotePath = "${uid}_${timestamp.replace(":", "-").replace("T", "_").substringBefore("Z")}_${licensePlate}.jpg"
                    launch {
                        val jwt = loadJwt()
                        if (jwt != null) {
                            val api = SupabaseApi(jwt)
                            val uploaded = api.uploadImage(entryImage, remotePath)
                            if (uploaded != null) {
                                db.updateEntryImage(id, uploaded)
                                LogBuffer.add("[DB] Entry image uploaded async: $uploaded")
                            }
                        }
                    }
                }

                // 3. Push parking log lên server
                val pushed = withJwtRefresh { jwt ->
                    val api = SupabaseApi(jwt)
                    var sess = db.getSessionById(sid)
                    if (sess != null && sess.serverId == null) {
                        // Nếu session chưa được đồng bộ, đồng bộ ngay lập tức để lấy serverId
                        val att = if (sess.attendantId > 0) db.getAttendantById(sess.attendantId) else null
                        val serverAttId = att?.serverId
                        val sId = api.pushSession(sess.name, sess.createdAt, sess.status, serverAttId)
                        if (sId != null) {
                            db.markSessionSyncedWithServerId(sess.id, sId)
                            sess = db.getSessionById(sid)
                            LogBuffer.add("[DB] Session synced immediately: id=${sess?.id} serverId=$sId")
                        }
                    }
                    val serverSessId = sess?.serverId
                    if (serverSessId != null) {
                        val log = ParkingLog(
                            id = id, licensePlate = licensePlate, timeIn = timestamp,
                            sessionId = serverSessId, entryImage = entryImage
                        )
                        api.pushParkingLog(log)
                    } else {
                        LogBuffer.add("[DB] Cannot push parking log immediately because session server id is null")
                        null
                    }
                }
                if (pushed != null) {
                    db.markParkingLogSyncedWithServerId(id, pushed)
                    LogBuffer.add("[DB] Entry pushed OK: $licensePlate -> serverId=$pushed")
                } else {
                    LogBuffer.add("[DB] pushParkingLog failed, enqueue sync")
                    enqueueSync()
                }
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
                // 1. Ghi DB trước với local path
                val rows = db.recordExit(licensePlate, exitImage)
                LogBuffer.add("[DB] Exit local: $licensePlate rows=$rows")
                if (rows == 0) {
                    withContext(Dispatchers.Main) { promise.reject("NOT_FOUND", "No active entry found for this plate") }
                    return@launch
                }

                // 2. Upload ảnh async (không block)
                if (exitImage != null) {
                    val localId = loadLocalId()
                    if (localId != -1L) {
                        val att = db.getAttendantById(localId)
                        val uid = att?.uid ?: "unknown"
                        val remotePath = "${uid}_exit_${DatabaseHelper.formatNow().replace(":", "-").replace("T", "_").substringBefore("Z")}_${licensePlate}.jpg"
                        launch {
                            val jwt = loadJwt()
                            if (jwt != null) {
                                val api = SupabaseApi(jwt)
                                val uploaded = api.uploadImage(exitImage, remotePath)
                                if (uploaded != null) {
                                    val log = db.getUnsyncedParkingLogByPlate(licensePlate)
                                    if (log != null) db.updateExitImage(log.id, uploaded)
                                    LogBuffer.add("[DB] Exit image uploaded async: $uploaded")
                                }
                            }
                        }
                    }
                }

                // 3. Update server
                val log = db.getUnsyncedParkingLogByPlate(licensePlate)
                if (log != null && log.serverId != null) {
                    val ok = withJwtRefresh { jwt ->
                        val api = SupabaseApi(jwt)
                        api.updateParkingLog(log.serverId, log.timeOut ?: DatabaseHelper.formatNow(), exitImage, log.fee)
                    }
                    if (ok == true) {
                        db.markParkingLogSyncedWithServerId(log.id, log.serverId)
                        LogBuffer.add("[DB] Exit pushed (UPDATE): $licensePlate")
                    } else {
                        LogBuffer.add("[DB] updateParkingLog failed, enqueue sync")
                        enqueueSync()
                    }
                } else {
                    LogBuffer.add("[DB] Exit no serverId (${log?.serverId}), enqueue sync")
                    enqueueSync()
                }
                withContext(Dispatchers.Main) { promise.resolve(rows) }
            } catch (e: Exception) {
                LogBuffer.add("[DB] recordExitFull error: ${e.message}")
                withContext(Dispatchers.Main) { promise.reject("DB_ERROR", e.message) }
            }
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
    fun getTodayStats(promise: Promise) {
        try {
            val stats = db.getTodayStats()
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
    fun searchParkingLogs(query: String?, onlyParked: String?, offset: Double, limit: Double, promise: Promise) {
        try {
            val logs = db.searchParkingLogs(
                query = query,
                onlyParked = onlyParked == "true",
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

    // ── Debug SQL ──

    @ReactMethod
    fun executeSql(sql: String, promise: Promise) {
        if (!BuildConfig.DEBUG) {
            promise.reject("FORBIDDEN", "executeSql is only available in debug builds")
            return
        }
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
    fun addListener(eventName: String) {}
    @ReactMethod
    fun removeListeners(count: Int) {}
}
