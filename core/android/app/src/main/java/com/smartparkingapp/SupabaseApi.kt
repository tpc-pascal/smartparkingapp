package com.smartparkingapp

import com.google.gson.Gson
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Cache
import java.io.File
import java.util.concurrent.TimeUnit

data class AuthResult(
    val uid: String,
    val jwt: String,
    val refreshToken: String = "",
)

class SupabaseApi(
    private val jwt: String? = null,
) {
    companion object {
        private const val TAG = "SupabaseApi"
        private var _cacheDir: File? = null
        private val sharedClient by lazy {
            val builder = OkHttpClient.Builder()
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(15, TimeUnit.SECONDS)
                .connectionPool(okhttp3.ConnectionPool(5, 30, TimeUnit.SECONDS))
            val dir = _cacheDir
            if (dir != null) {
                builder.cache(Cache(dir, 10L * 1024 * 1024))
                android.util.Log.d(TAG, "OkHttp cache enabled: $dir")
            }
            builder.build()
        }
        fun setCacheDir(dir: File) { _cacheDir = dir }
    }

    private val client get() = sharedClient

    private val gson = Gson()
    private val restUrl = "${SupabaseConfig.SUPABASE_URL}/rest/v1"
    private val authUrl = "${SupabaseConfig.SUPABASE_URL}/auth/v1"
    private val storageUrl = "${SupabaseConfig.SUPABASE_URL}/storage/v1"
    private val functionsUrl = "${SupabaseConfig.SUPABASE_URL}/functions/v1"
    private val jsonType = "application/json; charset=utf-8".toMediaType()
    private val jpegType = "image/jpeg".toMediaType()

    // ── Auth Headers ──

    private fun authHeaders(): Map<String, String> {
        val map = mutableMapOf(
            "apikey" to SupabaseConfig.SUPABASE_ANON_KEY,
            "Content-Type" to "application/json",
        )
        if (jwt != null) map["Authorization"] = "Bearer $jwt"
        return map
    }

    // ──────────────────────────────────────────────
    //  AUTH (OkHttp — no supabase-kt dependency)
    // ──────────────────────────────────────────────

    fun signUp(email: String, password: String): AuthResult? {
        val json = gson.toJson(
            buildJsonObject {
                addProperty("email", email)
                addProperty("password", password)
            }
        )
        val url = "$authUrl/signup"
        LogBuffer.add("[AUTH] signUp: calling $url email=$email")
        val request = Request.Builder()
            .url(url)
            .post(json.toRequestBody(jsonType))
            .addHeader("apikey", SupabaseConfig.SUPABASE_ANON_KEY)
            .addHeader("Content-Type", "application/json")
            .build()
        return try {
            val resp = client.newCall(request).execute()
            val bodyStr = resp.body?.string()
            if (!resp.isSuccessful || bodyStr.isNullOrBlank()) {
                LogBuffer.add("[AUTH] signUp failed: ${resp.code} $bodyStr")
                android.util.Log.e("SupabaseApi", "signUp failed: ${resp.code} $bodyStr")
                return null
            }
            val obj = gson.fromJson(bodyStr, JsonObject::class.java)
            val uid = obj.get("id")?.asString
                ?: obj.get("user")?.asJsonObject?.get("id")?.asString
            if (uid == null) {
                LogBuffer.add("[AUTH] signUp: no uid in response: $bodyStr")
                android.util.Log.e("SupabaseApi", "signUp: no uid in response: $bodyStr")
                return null
            }
            val jwt = obj.get("access_token")?.asString
            if (jwt == null) {
                LogBuffer.add("[AUTH] signUp: no access_token (email confirmation enabled), signing in...")
                android.util.Log.w("SupabaseApi", "signUp: no access_token, falling back to signIn")
                val signInResult = signIn(email, password)
                if (signInResult != null) {
                    LogBuffer.add("[AUTH] signUp -> signIn OK: uid=${signInResult.uid}")
                    return signInResult
                }
                LogBuffer.add("[AUTH] signUp: fallback signIn also failed: $bodyStr")
                android.util.Log.e("SupabaseApi", "signUp: fallback signIn failed")
                return null
            }
            val refreshToken = obj.get("refresh_token")?.asString ?: ""
            LogBuffer.add("[AUTH] signUp OK: uid=$uid")
            AuthResult(uid, jwt, refreshToken)
        } catch (e: Exception) {
            LogBuffer.add("[AUTH] signUp exception: ${e.message}")
            android.util.Log.e("SupabaseApi", "signUp exception", e)
            null
        }
    }

    fun signIn(email: String, password: String): AuthResult? {
        val json = gson.toJson(
            buildJsonObject {
                addProperty("email", email)
                addProperty("password", password)
                add("gotrue_meta_security", JsonObject())
            }
        )
        val url = "$authUrl/token?grant_type=password"
        LogBuffer.add("[AUTH] signIn: calling $url email=$email")
        val request = Request.Builder()
            .url(url)
            .post(json.toRequestBody(jsonType))
            .addHeader("apikey", SupabaseConfig.SUPABASE_ANON_KEY)
            .addHeader("Content-Type", "application/json")
            .build()
        return try {
            val resp = client.newCall(request).execute()
            val bodyStr = resp.body?.string()
            if (!resp.isSuccessful || bodyStr.isNullOrBlank()) {
                LogBuffer.add("[AUTH] signIn failed: ${resp.code} $bodyStr")
                android.util.Log.e("SupabaseApi", "signIn failed: ${resp.code} $bodyStr")
                return null
            }
            val obj = gson.fromJson(bodyStr, JsonObject::class.java)
            val uid = obj.get("user")?.asJsonObject?.get("id")?.asString
            if (uid == null) {
                LogBuffer.add("[AUTH] signIn: no uid in response: $bodyStr")
                android.util.Log.e("SupabaseApi", "signIn: no uid in response: $bodyStr")
                return null
            }
            val jwt = obj.get("access_token")?.asString
            if (jwt == null) {
                LogBuffer.add("[AUTH] signIn: no access_token in response: $bodyStr")
                android.util.Log.e("SupabaseApi", "signIn: no access_token in response: $bodyStr")
                return null
            }
            val refreshToken = obj.get("refresh_token")?.asString ?: ""
            LogBuffer.add("[AUTH] signIn OK: uid=$uid")
            AuthResult(uid, jwt, refreshToken)
        } catch (e: Exception) {
            LogBuffer.add("[AUTH] signIn exception: ${e.message}")
            android.util.Log.e("SupabaseApi", "signIn exception", e)
            null
        }
    }

    fun signOut() {
        val url = "$authUrl/logout"
        LogBuffer.add("[AUTH] signOut: calling $url")
        val request = Request.Builder()
            .url(url)
            .post("".toRequestBody(jsonType))
            .apply { authHeaders().forEach { (k, v) -> addHeader(k, v) } }
            .build()
        try {
            val resp = client.newCall(request).execute()
            LogBuffer.add("[AUTH] signOut: ${resp.code}")
        } catch (e: Exception) {
            LogBuffer.add("[AUTH] signOut exception: ${e.message}")
        }
    }

    fun refreshToken(refreshToken: String): AuthResult? {
        val json = gson.toJson(
            buildJsonObject {
                addProperty("refresh_token", refreshToken)
            }
        )
        val url = "$authUrl/token?grant_type=refresh_token"
        LogBuffer.add("[AUTH] refreshToken: calling $url")
        val request = Request.Builder()
            .url(url)
            .post(json.toRequestBody(jsonType))
            .addHeader("apikey", SupabaseConfig.SUPABASE_ANON_KEY)
            .addHeader("Content-Type", "application/json")
            .build()
        return try {
            val resp = client.newCall(request).execute()
            val bodyStr = resp.body?.string()
            if (!resp.isSuccessful || bodyStr.isNullOrBlank()) {
                LogBuffer.add("[AUTH] refreshToken failed: ${resp.code} $bodyStr")
                android.util.Log.e("SupabaseApi", "refreshToken failed: ${resp.code} $bodyStr")
                return null
            }
            val obj = gson.fromJson(bodyStr, JsonObject::class.java)
            val uid = obj.get("user")?.asJsonObject?.get("id")?.asString
            if (uid == null) {
                LogBuffer.add("[AUTH] refreshToken: no uid in response: $bodyStr")
                android.util.Log.e("SupabaseApi", "refreshToken: no uid: $bodyStr")
                return null
            }
            val jwt = obj.get("access_token")?.asString
            if (jwt == null) {
                LogBuffer.add("[AUTH] refreshToken: no access_token in response: $bodyStr")
                android.util.Log.e("SupabaseApi", "refreshToken: no token: $bodyStr")
                return null
            }
            val newRefresh = obj.get("refresh_token")?.asString ?: ""
            LogBuffer.add("[AUTH] refreshToken OK: uid=$uid")
            AuthResult(uid, jwt, newRefresh)
        } catch (e: Exception) {
            LogBuffer.add("[AUTH] refreshToken exception: ${e.message}")
            android.util.Log.e("SupabaseApi", "refreshToken exception", e)
            null
        }
    }

    // ──────────────────────────────────────────────
    //  REST API (REST CRUD via OkHttp)
    // ──────────────────────────────────────────────

    fun pushAttendant(uid: String, email: String): Long? {
        val body = buildJsonObject {
            addProperty("uid", uid)
            addProperty("email", email)
        }
        return post(SupabaseConfig.TABLE_ATTENDANTS, body)
    }

    fun pushParkingLog(log: ParkingLog): Long? {
        val body = buildJsonObject {
            addProperty("license_plate", log.licensePlate)
            addProperty("time_in", log.timeIn)
            addProperty("session_id", log.sessionId)
            if (log.timeOut != null) addProperty("time_out", log.timeOut)
            if (log.entryImage != null) addProperty("entry_image", log.entryImage)
            if (log.exitImage != null) addProperty("exit_image", log.exitImage)
            addProperty("fee", log.fee)
        }
        return post(SupabaseConfig.TABLE_PARKING_LOGS, body)
    }

    fun deleteAttendant(serverId: Long): Boolean {
        val url = "$restUrl/${SupabaseConfig.TABLE_ATTENDANTS}?id=eq.$serverId"
        return try {
            val request = Request.Builder()
                .url(url)
                .delete()
                .apply { authHeaders().forEach { (k, v) -> addHeader(k, v) } }
                .build()
            val resp = client.newCall(request).execute()
            LogBuffer.add("[SUPABASE] DELETE attendant: ${resp.code}")
            resp.isSuccessful
        } catch (e: Exception) {
            LogBuffer.add("[SUPABASE] DELETE attendant FAILED: ${e.message}")
            false
        }
    }

    fun deleteAccountViaFunction(uid: String, serverId: Long): Boolean {
        val body = gson.toJson(buildJsonObject {
            addProperty("uid", uid)
            addProperty("serverId", serverId)
        })
        val url = "$functionsUrl/delete-account"
        return try {
            val request = Request.Builder()
                .url(url)
                .post(body.toRequestBody(jsonType))
                .apply { authHeaders().forEach { (k, v) -> addHeader(k, v) } }
                .build()
            val resp = client.newCall(request).execute()
            val ok = resp.isSuccessful
            LogBuffer.add("[SUPABASE] delete-account function: ${resp.code} ok=$ok")
            ok
        } catch (e: Exception) {
            LogBuffer.add("[SUPABASE] delete-account function FAILED: ${e.message}")
            false
        }
    }

    fun updateParkingLog(serverId: Long, timeOut: String, exitImage: String?, fee: Int): Boolean {
        val body = buildJsonObject {
            addProperty("time_out", timeOut)
            if (exitImage != null) addProperty("exit_image", exitImage)
            addProperty("fee", fee)
        }
        val url = "$restUrl/${SupabaseConfig.TABLE_PARKING_LOGS}?id=eq.$serverId"
        val json = gson.toJson(body)
        val request = Request.Builder()
            .url(url)
            .patch(json.toRequestBody(jsonType))
            .apply { authHeaders().forEach { (k, v) -> addHeader(k, v) } }
            .build()
        return try {
            val resp = client.newCall(request).execute()
            LogBuffer.add("[SUPABASE] PATCH parking_log: ${resp.code}")
            resp.isSuccessful
        } catch (e: Exception) {
            LogBuffer.add("[SUPABASE] PATCH parking_log FAILED: ${e.message}")
            false
        }
    }

    fun updateParkingLogImage(serverId: Long, entryImage: String?, exitImage: String?): Boolean {
        val body = buildJsonObject {
            if (entryImage != null) addProperty("entry_image", entryImage)
            if (exitImage != null) addProperty("exit_image", exitImage)
        }
        val url = "$restUrl/${SupabaseConfig.TABLE_PARKING_LOGS}?id=eq.$serverId"
        val json = gson.toJson(body)
        val request = Request.Builder()
            .url(url)
            .patch(json.toRequestBody(jsonType))
            .apply { authHeaders().forEach { (k, v) -> addHeader(k, v) } }
            .build()
        return try {
            val resp = client.newCall(request).execute()
            LogBuffer.add("[SUPABASE] PATCH parking_log image: ${resp.code}")
            resp.isSuccessful
        } catch (e: Exception) {
            LogBuffer.add("[SUPABASE] PATCH parking_log image FAILED: ${e.message}")
            false
        }
    }

    fun uploadImage(localPath: String, remotePath: String): String? {
        val cleanPath = localPath.removePrefix("file://")
        val file = File(cleanPath)
        if (!file.exists()) {
            LogBuffer.add("[SUPABASE] uploadImage: file not found $cleanPath")
            return null
        }
        return try {
            val bytes = file.readBytes()
            val url = "$storageUrl/object/parking-images/$remotePath"
            val request = Request.Builder()
                .url(url)
                .put(bytes.toRequestBody(jpegType))
                .apply { authHeaders().forEach { (k, v) -> addHeader(k, v) } }
                .build()
            val resp = client.newCall(request).execute()
            val bodyStr = resp.body?.string()
            if (resp.isSuccessful) {
                val publicUrl = "$storageUrl/object/public/parking-images/$remotePath"
                LogBuffer.add("[SUPABASE] upload OK: $publicUrl")
                publicUrl
            } else {
                LogBuffer.add("[SUPABASE] upload FAILED: ${resp.code} $bodyStr")
                null
            }
        } catch (e: Exception) {
            LogBuffer.add("[SUPABASE] upload exception: ${e.message}")
            null
        }
    }

    fun sendResetCode(email: String): Boolean {
        val json = gson.toJson(buildJsonObject { addProperty("email", email) })
        val url = "$functionsUrl/send-reset-code"
        LogBuffer.add("[SUPABASE] sendResetCode: calling $url email=$email")
        val request = Request.Builder()
            .url(url)
            .post(json.toRequestBody(jsonType))
            .addHeader("apikey", SupabaseConfig.SUPABASE_ANON_KEY)
            .addHeader("Content-Type", "application/json")
            .build()
        return try {
            val resp = client.newCall(request).execute()
            val ok = resp.isSuccessful
            LogBuffer.add("[SUPABASE] sendResetCode: ${resp.code} ok=$ok")
            ok
        } catch (e: Exception) {
            LogBuffer.add("[SUPABASE] sendResetCode exception: ${e.message}")
            false
        }
    }

    fun verifyResetCode(email: String, code: String, newPassword: String): Boolean {
        val json = gson.toJson(buildJsonObject {
            addProperty("email", email)
            addProperty("code", code)
            addProperty("newPassword", newPassword)
        })
        val url = "$functionsUrl/verify-reset-code"
        LogBuffer.add("[SUPABASE] verifyResetCode: calling $url email=$email")
        val request = Request.Builder()
            .url(url)
            .post(json.toRequestBody(jsonType))
            .addHeader("apikey", SupabaseConfig.SUPABASE_ANON_KEY)
            .addHeader("Content-Type", "application/json")
            .build()
        return try {
            val resp = client.newCall(request).execute()
            val ok = resp.isSuccessful
            LogBuffer.add("[SUPABASE] verifyResetCode: ${resp.code} ok=$ok")
            ok
        } catch (e: Exception) {
            LogBuffer.add("[SUPABASE] verifyResetCode exception: ${e.message}")
            false
        }
    }

    fun pushSession(name: String, createdAt: String, status: String, attendantId: Long? = null): Long? {
        val body = buildJsonObject {
            addProperty("name", name)
            addProperty("created_at", createdAt)
            addProperty("status", status)
            if (attendantId != null) addProperty("attendant_id", attendantId)
        }
        return post(SupabaseConfig.TABLE_SESSIONS, body)
    }

    fun updateSessionStatus(serverId: Long, status: String): Boolean {
        val body = buildJsonObject {
            addProperty("ended_at", DatabaseHelper.formatNow())
            addProperty("status", status)
        }
        val url = "$restUrl/${SupabaseConfig.TABLE_SESSIONS}?id=eq.$serverId"
        val json = gson.toJson(body)
        return try {
            val request = Request.Builder()
                .url(url)
                .patch(json.toRequestBody(jsonType))
                .apply { authHeaders().forEach { (k, v) -> addHeader(k, v) } }
                .build()
            val resp = client.newCall(request).execute()
            LogBuffer.add("[SUPABASE] PATCH session: ${resp.code}")
            resp.isSuccessful
        } catch (e: Exception) {
            LogBuffer.add("[SUPABASE] PATCH session FAILED: ${e.message}")
            false
        }
    }

    fun fetchMyAttendant(uid: String): Attendant? {
        val url = "$restUrl/${SupabaseConfig.TABLE_ATTENDANTS}?uid=eq.$uid&select=id,uid,email"
        val jsonArr = get(url) ?: return null
        if (jsonArr.size() == 0) return null
        val obj = jsonArr.get(0).asJsonObject
        return Attendant(
            id = obj.get("id")?.asLong ?: return null,
            uid = obj.get("uid")?.asString ?: "",
            email = obj.get("email")?.asString ?: "",
            serverId = obj.get("id")?.asLong,
        )
    }

    fun fetchMyParkingLogsSince(sinceTimestamp: String?): List<ParkingLog> {
        val ts = if (sinceTimestamp != null && sinceTimestamp.isNotBlank()) "&time_in=gt.$sinceTimestamp" else ""
        val url = "$restUrl/${SupabaseConfig.TABLE_PARKING_LOGS}?select=id,license_plate,time_in,time_out,session_id,entry_image,exit_image,fee&order=time_in.desc$ts"
        val jsonArr = get(url) ?: return emptyList()
        val list = mutableListOf<ParkingLog>()
        for (elem in jsonArr) {
            val obj = elem.asJsonObject
            list.add(
                ParkingLog(
                    licensePlate = obj.get("license_plate")?.asString ?: continue,
                    timeIn = obj.get("time_in")?.asString ?: continue,
                    timeOut = obj.get("time_out")?.asString,
                    sessionId = obj.get("session_id")?.asLong ?: 0,
                    serverId = obj.get("id")?.asLong,
                    entryImage = obj.get("entry_image")?.asString,
                    exitImage = obj.get("exit_image")?.asString,
                    fee = obj.get("fee")?.asInt ?: 0,
                )
            )
        }
        return list
    }

    fun fetchMyParkingLogs(): List<ParkingLog> {
        val url = "$restUrl/${SupabaseConfig.TABLE_PARKING_LOGS}?select=id,license_plate,time_in,time_out,session_id,entry_image,exit_image,fee&order=time_in.desc"
        val jsonArr = get(url) ?: return emptyList()
        val list = mutableListOf<ParkingLog>()
        for (elem in jsonArr) {
            val obj = elem.asJsonObject
            list.add(
                ParkingLog(
                    licensePlate = obj.get("license_plate")?.asString ?: continue,
                    timeIn = obj.get("time_in")?.asString ?: continue,
                    timeOut = obj.get("time_out")?.asString,
                    sessionId = obj.get("session_id")?.asLong ?: 0,
                    serverId = obj.get("id")?.asLong,
                    entryImage = obj.get("entry_image")?.asString,
                    exitImage = obj.get("exit_image")?.asString,
                    fee = obj.get("fee")?.asInt ?: 0,
                )
            )
        }
        return list
    }

    fun fetchAllAttendants(): List<Attendant> {
        val url = "$restUrl/${SupabaseConfig.TABLE_ATTENDANTS}?select=id,uid,email"
        val jsonArr = get(url) ?: return emptyList()
        val list = mutableListOf<Attendant>()
        for (elem in jsonArr) {
            val obj = elem.asJsonObject
            list.add(
                Attendant(
                    id = obj.get("id")?.asLong ?: continue,
                    uid = obj.get("uid")?.asString ?: "",
                    email = obj.get("email")?.asString ?: continue,
                    serverId = obj.get("id")?.asLong,
                )
            )
        }
        return list
    }

    // ── HTTP helpers ──

    private fun post(table: String, body: JsonObject): Long? {
        val url = "$restUrl/$table"
        val json = gson.toJson(body)
        return try {
            val request = Request.Builder()
                .url(url)
                .post(json.toRequestBody(jsonType))
                .apply { authHeaders().forEach { (k, v) -> addHeader(k, v) } }
                .addHeader("Prefer", "return=representation")
                .build()
            val resp = client.newCall(request).execute()
            val bodyStr = resp.body?.string()
            if (!resp.isSuccessful || bodyStr.isNullOrBlank()) {
                LogBuffer.add("[SUPABASE] POST $table failed: ${resp.code} $bodyStr")
                return null
            }
            val arr = gson.fromJson(bodyStr, JsonArray::class.java)
            if (arr.size() == 0) return null
            arr[0].asJsonObject?.get("id")?.asLong
        } catch (e: Exception) {
            LogBuffer.add("[SUPABASE] POST $table exception: ${e.message}")
            null
        }
    }

    private fun get(url: String): JsonArray? {
        return try {
            val request = Request.Builder()
                .url(url)
                .get()
                .apply { authHeaders().forEach { (k, v) -> addHeader(k, v) } }
                .build()
            val resp = client.newCall(request).execute()
            val bodyStr = resp.body?.string()
            if (!resp.isSuccessful || bodyStr.isNullOrBlank()) {
                LogBuffer.add("[SUPABASE] GET failed: ${resp.code} $bodyStr")
                return null
            }
            gson.fromJson(bodyStr, JsonArray::class.java)
        } catch (e: Exception) {
            LogBuffer.add("[SUPABASE] GET exception: ${e.message}")
            null
        }
    }

    private fun buildJsonObject(block: JsonObject.() -> Unit): JsonObject {
        val obj = JsonObject()
        obj.block()
        return obj
    }
}
