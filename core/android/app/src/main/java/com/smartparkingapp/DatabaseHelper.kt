package com.smartparkingapp

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.text.SimpleDateFormat
import java.util.*
import kotlin.math.ceil
import kotlin.math.max

data class Attendant(
    val id: Long = 0,
    val uid: String = "",
    val email: String,
    val passwordHash: String? = null,
    val refreshToken: String? = null,
    val isSynced: Boolean = false,
    val serverId: Long? = null,
    val jwtToken: String? = null,
)

data class ParkingLog(
    val id: Long = 0,
    val licensePlate: String,
    val timeIn: String,
    val timeOut: String? = null,
    val sessionId: Long = 0,
    val isSynced: Boolean = false,
    val serverId: Long? = null,
    val entryImage: String? = null,
    val exitImage: String? = null,
    val fee: Int = 0,
)

data class Session(
    val id: Long = 0,
    val name: String,
    val status: String = "active",
    val createdAt: String = "",
    val endedAt: String? = null,
    val isSynced: Boolean = false,
    val serverId: Long? = null,
    val attendantId: Long = 0,
)

data class TodayStats(
    val entryCount: Int = 0,
    val exitCount: Int = 0,
    val parkedCount: Int = 0,
)

class DatabaseHelper(context: Context) : SQLiteOpenHelper(
    context, DATABASE_NAME, null, DATABASE_VERSION
) {
    companion object {
        private const val DATABASE_NAME = "smartparking.db"
        private const val DATABASE_VERSION = 14

        private const val TABLE_ATTENDANTS = "attendants"
        private const val TABLE_PARKING_LOGS = "parking_logs"
        private const val TABLE_SESSIONS = "sessions"

        private const val COL_ID = "id"
        private const val COL_UID = "uid"
        private const val COL_EMAIL = "email"
        private const val COL_JWT = "jwt_token"
        private const val COL_PASSWORD_HASH = "password_hash"
        private const val COL_REFRESH_TOKEN = "refresh_token"
        private const val COL_LICENSE_PLATE = "license_plate"
        private const val COL_TIME_IN = "time_in"
        private const val COL_TIME_OUT = "time_out"
        private const val COL_ATTENDANT_ID = "attendant_id"
        private const val COL_IS_SYNCED = "is_synced"
        private const val COL_SERVER_ID = "server_id"
        private const val COL_ENTRY_IMAGE = "entry_image"
        private const val COL_EXIT_IMAGE = "exit_image"
        private const val COL_FEE = "fee"
        private const val COL_SESSION_ID = "session_id"
        private const val COL_SESSION_NAME = "name"
        private const val COL_SESSION_STATUS = "status"
        private const val COL_CREATED_AT = "created_at"
        private const val COL_ENDED_AT = "ended_at"

        private val dateFmt = ThreadLocal<SimpleDateFormat>()

        private val vnTz = TimeZone.getTimeZone("Asia/Ho_Chi_Minh")

        private fun getDateFormat(): SimpleDateFormat {
            var fmt = dateFmt.get()
            if (fmt == null) {
                fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US)
                fmt.timeZone = vnTz
                dateFmt.set(fmt)
            }
            return fmt
        }
        fun formatNow() = getDateFormat().format(Date())
        fun todayStart(): String {
            val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.US)
            sdf.timeZone = vnTz
            return sdf.format(Date()) + "T00:00:00+07:00"
        }
        fun todayEnd(): String {
            val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.US)
            sdf.timeZone = vnTz
            return sdf.format(Date()) + "T23:59:59+07:00"
        }
        fun sha256(input: String): String {
            val digest = java.security.MessageDigest.getInstance("SHA-256")
            return digest.digest(input.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
        }
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE $TABLE_ATTENDANTS (
                $COL_ID INTEGER PRIMARY KEY AUTOINCREMENT,
                $COL_UID TEXT UNIQUE,
                $COL_EMAIL TEXT UNIQUE NOT NULL,
                $COL_JWT TEXT,
                $COL_PASSWORD_HASH TEXT,
                $COL_REFRESH_TOKEN TEXT,
                $COL_IS_SYNCED INTEGER NOT NULL DEFAULT 0,
                $COL_SERVER_ID INTEGER
            )
        """)

        db.execSQL("""
            CREATE TABLE $TABLE_PARKING_LOGS (
                $COL_ID INTEGER PRIMARY KEY AUTOINCREMENT,
                $COL_LICENSE_PLATE TEXT NOT NULL,
                $COL_TIME_IN TEXT NOT NULL,
                $COL_TIME_OUT TEXT,
                $COL_SESSION_ID INTEGER NOT NULL,
                $COL_IS_SYNCED INTEGER NOT NULL DEFAULT 0,
                $COL_SERVER_ID INTEGER,
                $COL_ENTRY_IMAGE TEXT,
                $COL_EXIT_IMAGE TEXT,
                $COL_FEE INTEGER NOT NULL DEFAULT 0
            )
        """)

        db.execSQL("CREATE INDEX idx_logs_plate ON $TABLE_PARKING_LOGS($COL_LICENSE_PLATE)")
        db.execSQL("CREATE INDEX idx_logs_time_in ON $TABLE_PARKING_LOGS($COL_TIME_IN)")
        db.execSQL("CREATE INDEX idx_logs_time_out ON $TABLE_PARKING_LOGS($COL_TIME_OUT)")
        db.execSQL("CREATE INDEX idx_logs_synced ON $TABLE_PARKING_LOGS($COL_IS_SYNCED)")
        db.execSQL("CREATE INDEX idx_logs_server ON $TABLE_PARKING_LOGS($COL_SERVER_ID)")
        db.execSQL("CREATE INDEX idx_att_refresh ON $TABLE_ATTENDANTS($COL_REFRESH_TOKEN)")

        db.execSQL("""
            CREATE TABLE $TABLE_SESSIONS (
                $COL_ID INTEGER PRIMARY KEY AUTOINCREMENT,
                $COL_SESSION_NAME TEXT NOT NULL,
                $COL_SESSION_STATUS TEXT NOT NULL DEFAULT 'active',
                $COL_CREATED_AT TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
                $COL_ENDED_AT TEXT,
                $COL_IS_SYNCED INTEGER NOT NULL DEFAULT 0,
                $COL_SERVER_ID INTEGER,
                $COL_ATTENDANT_ID INTEGER NOT NULL DEFAULT 0
            )
        """)
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_sess_status ON $TABLE_SESSIONS($COL_SESSION_STATUS)")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_sess_attendant ON $TABLE_SESSIONS($COL_ATTENDANT_ID)")
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_sess_created ON $TABLE_SESSIONS($COL_CREATED_AT)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) {
            db.execSQL("ALTER TABLE $TABLE_ATTENDANTS ADD COLUMN $COL_SERVER_ID INTEGER")
            db.execSQL("ALTER TABLE $TABLE_PARKING_LOGS ADD COLUMN $COL_SERVER_ID INTEGER")
        }
        if (oldVersion < 3) {
            db.execSQL("ALTER TABLE $TABLE_PARKING_LOGS ADD COLUMN $COL_ENTRY_IMAGE TEXT")
            db.execSQL("ALTER TABLE $TABLE_PARKING_LOGS ADD COLUMN $COL_EXIT_IMAGE TEXT")
        }
        if (oldVersion < 4) {
            db.execSQL("ALTER TABLE $TABLE_ATTENDANTS ADD COLUMN $COL_UID TEXT")
            db.execSQL("ALTER TABLE $TABLE_ATTENDANTS ADD COLUMN $COL_JWT TEXT")
        }
        if (oldVersion < 5) {
            db.execSQL("ALTER TABLE $TABLE_ATTENDANTS ADD COLUMN $COL_PASSWORD_HASH TEXT")
            db.execSQL("ALTER TABLE $TABLE_ATTENDANTS ADD COLUMN $COL_REFRESH_TOKEN TEXT")
        }
        if (oldVersion < 6) {
            db.execSQL("ALTER TABLE ${TABLE_ATTENDANTS} ADD COLUMN ${COL_EMAIL} TEXT")
            db.execSQL("UPDATE ${TABLE_ATTENDANTS} SET ${COL_EMAIL} = full_name")
            val tmpTable = "${TABLE_ATTENDANTS}_new"
            db.execSQL("""
                CREATE TABLE $tmpTable (
                    $COL_ID INTEGER PRIMARY KEY AUTOINCREMENT,
                    $COL_UID TEXT UNIQUE,
                    $COL_EMAIL TEXT UNIQUE NOT NULL,
                    $COL_JWT TEXT,
                    $COL_PASSWORD_HASH TEXT,
                    $COL_REFRESH_TOKEN TEXT,
                    $COL_IS_SYNCED INTEGER NOT NULL DEFAULT 0,
                    $COL_SERVER_ID INTEGER
                )
            """)
            db.execSQL("""
                INSERT INTO $tmpTable ($COL_ID, $COL_UID, $COL_EMAIL, $COL_JWT, $COL_PASSWORD_HASH, $COL_REFRESH_TOKEN, $COL_IS_SYNCED, $COL_SERVER_ID)
                SELECT $COL_ID, $COL_UID, $COL_EMAIL, $COL_JWT, $COL_PASSWORD_HASH, $COL_REFRESH_TOKEN, $COL_IS_SYNCED, $COL_SERVER_ID FROM $TABLE_ATTENDANTS
            """)
            db.execSQL("DROP TABLE $TABLE_ATTENDANTS")
            db.execSQL("ALTER TABLE $tmpTable RENAME TO $TABLE_ATTENDANTS")
        }
        if (oldVersion < 7) {
            db.execSQL("ALTER TABLE $TABLE_PARKING_LOGS ADD COLUMN $COL_FEE INTEGER NOT NULL DEFAULT 0")
        }
        if (oldVersion < 8) {
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_logs_plate ON $TABLE_PARKING_LOGS($COL_LICENSE_PLATE)")
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_logs_time_in ON $TABLE_PARKING_LOGS($COL_TIME_IN)")
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_logs_time_out ON $TABLE_PARKING_LOGS($COL_TIME_OUT)")
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_logs_synced ON $TABLE_PARKING_LOGS($COL_IS_SYNCED)")
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_logs_server ON $TABLE_PARKING_LOGS($COL_SERVER_ID)")
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_att_refresh ON $TABLE_ATTENDANTS($COL_REFRESH_TOKEN)")
        }
        if (oldVersion < 9) {
            // FTS was removed in v12 — no-op
        }
        if (oldVersion < 10) {
            db.execSQL("""
                CREATE TABLE IF NOT EXISTS $TABLE_SESSIONS (
                    $COL_ID INTEGER PRIMARY KEY AUTOINCREMENT,
                    $COL_SESSION_NAME TEXT NOT NULL,
                    $COL_SESSION_STATUS TEXT NOT NULL DEFAULT 'active',
                    $COL_CREATED_AT TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
                    $COL_ENDED_AT TEXT,
                    $COL_IS_SYNCED INTEGER NOT NULL DEFAULT 0,
                    $COL_SERVER_ID INTEGER
                )
            """)
            db.execSQL("ALTER TABLE $TABLE_PARKING_LOGS ADD COLUMN $COL_SESSION_ID INTEGER")
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_logs_session ON $TABLE_PARKING_LOGS($COL_SESSION_ID)")
        }
        if (oldVersion < 11) {
            db.execSQL("ALTER TABLE $TABLE_SESSIONS ADD COLUMN $COL_ATTENDANT_ID INTEGER NOT NULL DEFAULT 0")
        }
        if (oldVersion < 12) {
            db.execSQL("DROP TABLE IF EXISTS parking_logs_fts")
            db.execSQL("DROP TRIGGER IF EXISTS parking_logs_fts_ai")
            db.execSQL("DROP TRIGGER IF EXISTS parking_logs_fts_ad")
            db.execSQL("DROP TRIGGER IF EXISTS parking_logs_fts_au")
        }
        if (oldVersion < 13) {
            db.execSQL("UPDATE parking_logs SET session_id = (SELECT id FROM sessions WHERE attendant_id = parking_logs.attendant_id ORDER BY id LIMIT 1) WHERE session_id IS NULL")
            db.execSQL("INSERT OR IGNORE INTO sessions (name, created_at, status, attendant_id, is_synced) SELECT 'Dữ liệu cũ', datetime('now'), 'active', attendant_id, 0 FROM parking_logs WHERE session_id IS NULL GROUP BY attendant_id")
            db.execSQL("UPDATE parking_logs SET session_id = (SELECT id FROM sessions WHERE attendant_id = parking_logs.attendant_id ORDER BY id LIMIT 1) WHERE session_id IS NULL")
            db.execSQL("CREATE TABLE parking_logs_v13 (id INTEGER PRIMARY KEY AUTOINCREMENT, license_plate TEXT NOT NULL, time_in TEXT NOT NULL, time_out TEXT, session_id INTEGER NOT NULL, is_synced INTEGER NOT NULL DEFAULT 0, server_id INTEGER, entry_image TEXT, exit_image TEXT, fee INTEGER NOT NULL DEFAULT 0)")
            db.execSQL("INSERT INTO parking_logs_v13 SELECT id, license_plate, time_in, time_out, COALESCE(session_id, 0), is_synced, server_id, entry_image, exit_image, fee FROM parking_logs")
            db.execSQL("DROP TABLE parking_logs")
            db.execSQL("ALTER TABLE parking_logs_v13 RENAME TO parking_logs")
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_logs_session ON parking_logs(session_id)")
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_logs_plate ON parking_logs(license_plate)")
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_logs_time_in ON parking_logs(time_in)")
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_logs_time_out ON parking_logs(time_out)")
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_logs_synced ON parking_logs(is_synced)")
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_logs_server ON parking_logs(server_id)")
        }
        if (oldVersion < 14) {
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_sess_status ON $TABLE_SESSIONS($COL_SESSION_STATUS)")
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_sess_attendant ON $TABLE_SESSIONS($COL_ATTENDANT_ID)")
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_sess_created ON $TABLE_SESSIONS($COL_CREATED_AT)")
        }
    }

    // ── Attendant ──

    fun isEmailTaken(email: String): Boolean {
        val db = readableDatabase
        val cursor = db.rawQuery("SELECT COUNT(*) FROM $TABLE_ATTENDANTS WHERE $COL_EMAIL = ?", arrayOf(email))
        return cursor.use { it.moveToFirst() && it.getInt(0) > 0 }
    }

    fun deleteAttendantByEmail(email: String) {
        val db = writableDatabase
        db.delete(TABLE_ATTENDANTS, "$COL_EMAIL = ?", arrayOf(email))
    }

    fun insertAttendant(uid: String?, email: String): Long {
        val db = writableDatabase
        val values = ContentValues().apply {
            if (uid != null) put(COL_UID, uid)
            put(COL_EMAIL, email)
        }
        return db.insertOrThrow(TABLE_ATTENDANTS, null, values)
    }

    fun getAttendantById(id: Long): Attendant? {
        val db = readableDatabase
        val cursor = db.query(TABLE_ATTENDANTS, null, "$COL_ID = ?",
            arrayOf(id.toString()), null, null, null)
        return cursor.use {
            if (it.moveToFirst()) attendantFromCursor(it) else null
        }
    }

    fun getAttendantByEmail(email: String): Attendant? {
        val db = readableDatabase
        val cursor = db.query(TABLE_ATTENDANTS, null,
            "$COL_EMAIL = ?", arrayOf(email), null, null, null)
        return cursor.use {
            if (it.moveToFirst()) attendantFromCursor(it) else null
        }
    }

    fun updateJwt(id: Long, jwt: String) {
        val values = ContentValues().apply { put(COL_JWT, jwt) }
        writableDatabase.update(TABLE_ATTENDANTS, values, "$COL_ID = ?", arrayOf(id.toString()))
    }

    fun updateUid(id: Long, uid: String) {
        val values = ContentValues().apply { put(COL_UID, uid) }
        writableDatabase.update(TABLE_ATTENDANTS, values, "$COL_ID = ?", arrayOf(id.toString()))
    }

    fun insertAttendantFull(
        uid: String?, email: String,
        passwordHash: String?, jwt: String?, refreshToken: String?,
    ): Long {
        val db = writableDatabase
        val values = ContentValues().apply {
            if (uid != null) put(COL_UID, uid)
            put(COL_EMAIL, email)
            if (passwordHash != null) put(COL_PASSWORD_HASH, passwordHash)
            if (jwt != null) put(COL_JWT, jwt)
            if (refreshToken != null) put(COL_REFRESH_TOKEN, refreshToken)
        }
        return db.insertOrThrow(TABLE_ATTENDANTS, null, values)
    }

    fun updatePasswordHash(id: Long, hash: String) {
        val values = ContentValues().apply { put(COL_PASSWORD_HASH, hash) }
        writableDatabase.update(TABLE_ATTENDANTS, values, "$COL_ID = ?", arrayOf(id.toString()))
    }

    fun updateRefreshToken(id: Long, token: String) {
        val values = ContentValues().apply { put(COL_REFRESH_TOKEN, token) }
        writableDatabase.update(TABLE_ATTENDANTS, values, "$COL_ID = ?", arrayOf(id.toString()))
    }

    fun updateJwtAndRefresh(id: Long, jwt: String, refreshToken: String) {
        val values = ContentValues().apply {
            put(COL_JWT, jwt)
            put(COL_REFRESH_TOKEN, refreshToken)
        }
        writableDatabase.update(TABLE_ATTENDANTS, values, "$COL_ID = ?", arrayOf(id.toString()))
    }

    fun getAttendantByUid(uid: String): Attendant? {
        val db = readableDatabase
        val cursor = db.query(TABLE_ATTENDANTS, null,
            "$COL_UID = ?", arrayOf(uid), null, null, null)
        return cursor.use {
            if (it.moveToFirst()) attendantFromCursor(it) else null
        }
    }

    fun getAttendantByRefreshToken(token: String): Attendant? {
        val db = readableDatabase
        val cursor = db.query(TABLE_ATTENDANTS, null,
            "$COL_REFRESH_TOKEN = ? AND $COL_REFRESH_TOKEN IS NOT NULL",
            arrayOf(token), null, null, null)
        return cursor.use {
            if (it.moveToFirst()) attendantFromCursor(it) else null
        }
    }

    // ── Parking Log ──

    fun recordEntry(licensePlate: String, sessionId: Long, timestamp: String? = null, entryImage: String? = null): Long {
        val db = writableDatabase
        val timeIn = timestamp ?: formatNow()
        val values = ContentValues().apply {
            put(COL_LICENSE_PLATE, licensePlate)
            put(COL_TIME_IN, timeIn)
            put(COL_SESSION_ID, sessionId)
            if (entryImage != null) put(COL_ENTRY_IMAGE, entryImage)
        }
        return db.insertOrThrow(TABLE_PARKING_LOGS, null, values)
    }

    fun recordExit(licensePlate: String, exitImage: String? = null): Int {
        val db = writableDatabase
        val timeOut = formatNow()
        db.beginTransaction()
        try {
            val cursor = db.query(TABLE_PARKING_LOGS, arrayOf(COL_TIME_IN),
                "$COL_LICENSE_PLATE = ? AND $COL_TIME_OUT IS NULL",
                arrayOf(licensePlate), null, null, null)
            val timeIn = cursor.use {
                if (it.moveToFirst()) it.getString(it.getColumnIndexOrThrow(COL_TIME_IN)) else null
            }
            val fee = if (timeIn != null) calculateFee(timeIn, timeOut) else 0
            val values = ContentValues().apply {
                put(COL_TIME_OUT, timeOut)
                if (exitImage != null) put(COL_EXIT_IMAGE, exitImage)
                put(COL_FEE, fee)
                put(COL_IS_SYNCED, 0)
            }
            val rows = db.update(TABLE_PARKING_LOGS, values,
                "$COL_LICENSE_PLATE = ? AND $COL_TIME_OUT IS NULL",
                arrayOf(licensePlate))
            db.setTransactionSuccessful()
            return rows
        } finally {
            db.endTransaction()
        }
    }

    private fun parseIsoDate(dateStr: String): Long? {
        val cleanStr = dateStr.trim()
        val formats = arrayOf(
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss'Z'",
            "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
            "yyyy-MM-dd'T'HH:mm:ssXXX",
            "yyyy-MM-dd'T'HH:mm:ss.SSS",
            "yyyy-MM-dd'T'HH:mm:ss"
        )
        for (fmt in formats) {
            try {
                val sdf = SimpleDateFormat(fmt, Locale.US)
                if (fmt.contains("Z") || fmt.contains("XXX")) {
                    sdf.timeZone = TimeZone.getTimeZone("UTC")
                }
                val d = sdf.parse(cleanStr)
                if (d != null) return d.time
            } catch (e: Exception) {
                // Try next
            }
        }
        return null
    }

    private fun calculateFee(timeIn: String, timeOut: String): Int {
        val inTime = parseIsoDate(timeIn) ?: return 0
        val outTime = parseIsoDate(timeOut) ?: return 0
        val diffMs = outTime - inTime
        val hours = max(1, ceil(diffMs / (1000.0 * 60 * 60)).toInt())
        return hours * 10000
    }

    // ── Queries ──

    fun getCurrentlyParkedLogs(limit: Int = 50): List<ParkingLog> {
        return queryLogs("$COL_TIME_OUT IS NULL", null, "$COL_TIME_IN DESC", limit)
    }

    fun getParkingLogsBySession(sessionId: Long, limit: Int = 200): List<ParkingLog> {
        return queryLogs("$COL_SESSION_ID = ?", arrayOf(sessionId.toString()), "$COL_TIME_IN DESC", limit)
    }

    fun getTodayStats(sessionId: Long? = null): TodayStats {
        val db = readableDatabase
        val ts = todayStart()
        val te = todayEnd()
        val sessionFilter = if (sessionId != null) " AND $COL_SESSION_ID = ?" else ""
        val args = mutableListOf(ts, te, ts, te)
        if (sessionId != null) args.add(sessionId.toString())
        val cursor = db.rawQuery("""
            SELECT
                SUM(CASE WHEN $COL_TIME_IN >= ? AND $COL_TIME_IN <= ? THEN 1 ELSE 0 END),
                SUM(CASE WHEN $COL_TIME_OUT >= ? AND $COL_TIME_OUT <= ? THEN 1 ELSE 0 END),
                SUM(CASE WHEN $COL_TIME_OUT IS NULL THEN 1 ELSE 0 END)
            FROM $TABLE_PARKING_LOGS
            WHERE 1=1$sessionFilter
        """.trimIndent(), args.toTypedArray())
        return cursor.use {
            if (it.moveToFirst()) TodayStats(it.getInt(0), it.getInt(1), it.getInt(2))
            else TodayStats()
        }
    }

    fun searchParkingLogs(
        query: String? = null,
        onlyParked: Boolean = false,
        onlyExited: Boolean = false,
        sessionId: Long? = null,
        offset: Int = 0,
        limit: Int = 30,
    ): List<ParkingLog> {
        val conditions = mutableListOf<String>()
        val args = mutableListOf<String>()
        if (!query.isNullOrBlank()) {
            conditions.add("$COL_LICENSE_PLATE LIKE ?")
            args.add("%${query.trim()}%")
        }
        if (onlyParked) {
            conditions.add("$COL_TIME_OUT IS NULL")
        }
        if (onlyExited) {
            conditions.add("$COL_TIME_OUT IS NOT NULL")
        }
        if (sessionId != null) {
            conditions.add("$COL_SESSION_ID = ?")
            args.add(sessionId.toString())
        }
        val where = if (conditions.isEmpty()) null else conditions.joinToString(" AND ")
        return queryLogs(where, args.toTypedArray(), "$COL_TIME_IN DESC", limit, offset)
    }

    fun getAllParkingLogs(): List<ParkingLog> {
        return queryLogs(null, null, "$COL_TIME_IN DESC")
    }

    fun getUnsyncedParkingLogByPlate(licensePlate: String): ParkingLog? {
        return queryLogs("$COL_LICENSE_PLATE = ? AND $COL_IS_SYNCED = 0",
            arrayOf(licensePlate), "$COL_TIME_IN DESC", 1).firstOrNull()
    }

    fun getLogsWithPendingImageUpload(): List<ParkingLog> {
        return queryLogs(
            "$COL_IS_SYNCED = 1 AND $COL_SERVER_ID IS NOT NULL AND " +
            "(($COL_ENTRY_IMAGE IS NOT NULL AND $COL_ENTRY_IMAGE NOT LIKE 'http%') OR " +
            "($COL_EXIT_IMAGE IS NOT NULL AND $COL_EXIT_IMAGE NOT LIKE 'http%'))",
            null, "$COL_ID ASC")
    }

    // ── Update images ──

    fun updateEntryImage(logId: Long, imagePath: String) {
        val values = ContentValues().apply { put(COL_ENTRY_IMAGE, imagePath) }
        writableDatabase.update(TABLE_PARKING_LOGS, values, "$COL_ID = ?", arrayOf(logId.toString()))
    }

    fun updateExitImage(logId: Long, imagePath: String) {
        val values = ContentValues().apply { put(COL_EXIT_IMAGE, imagePath) }
        writableDatabase.update(TABLE_PARKING_LOGS, values, "$COL_ID = ?", arrayOf(logId.toString()))
    }

    // ── Sync ──

    fun getUnsyncedAttendants(): List<Attendant> {
        return queryAttendants("$COL_IS_SYNCED = 0", null)
    }

    fun getUnsyncedParkingLogs(): List<ParkingLog> {
        return queryLogs("$COL_IS_SYNCED = 0", null, "$COL_ID ASC")
    }

    fun getParkingLogsWithPendingImages(): List<ParkingLog> {
        return queryLogs(
            "$COL_SERVER_ID IS NOT NULL AND (($COL_ENTRY_IMAGE IS NOT NULL AND $COL_ENTRY_IMAGE NOT LIKE 'http%') OR ($COL_EXIT_IMAGE IS NOT NULL AND $COL_EXIT_IMAGE NOT LIKE 'http%'))",
            null, "$COL_ID ASC"
        )
    }

    fun getAllAttendants(): List<Attendant> {
        return queryAttendants(null, null)
    }

    fun upsertAttendantFromServer(serverId: Long, uid: String, email: String): Long {
        val db = writableDatabase
        var cursor = db.query(TABLE_ATTENDANTS, arrayOf(COL_ID),
            "$COL_SERVER_ID = ?", arrayOf(serverId.toString()), null, null, null)
        cursor.use {
            if (it.moveToFirst()) {
                val localId = it.getLong(0)
                val values = ContentValues().apply {
                    put(COL_UID, uid); put(COL_EMAIL, email)
                    put(COL_IS_SYNCED, 1); put(COL_SERVER_ID, serverId)
                }
                db.update(TABLE_ATTENDANTS, values, "$COL_ID = ?", arrayOf(localId.toString()))
                return localId
            }
        }
        cursor = db.query(TABLE_ATTENDANTS, arrayOf(COL_ID),
            "$COL_EMAIL = ?", arrayOf(email), null, null, null)
        cursor.use {
            if (it.moveToFirst()) {
                val localId = it.getLong(0)
                val values = ContentValues().apply {
                    put(COL_UID, uid)
                    put(COL_IS_SYNCED, 1); put(COL_SERVER_ID, serverId)
                }
                db.update(TABLE_ATTENDANTS, values, "$COL_ID = ?", arrayOf(localId.toString()))
                return localId
            }
        }
        val values = ContentValues().apply {
            put(COL_UID, uid); put(COL_EMAIL, email)
            put(COL_IS_SYNCED, 1); put(COL_SERVER_ID, serverId)
        }
        return db.insertOrThrow(TABLE_ATTENDANTS, null, values)
    }

    fun upsertParkingLogFromServer(
        serverId: Long, licensePlate: String, timeIn: String, timeOut: String?, sessionId: Long,
        entryImage: String? = null, exitImage: String? = null, fee: Int = 0,
    ): Long {
        val db = writableDatabase
        var cursor = db.query(TABLE_PARKING_LOGS, arrayOf(COL_ID),
            "$COL_SERVER_ID = ?", arrayOf(serverId.toString()), null, null, null)
        cursor.use {
            if (it.moveToFirst()) {
                val localId = it.getLong(0); updateParkingLog(db, localId, licensePlate, timeIn, timeOut, sessionId, serverId, entryImage, exitImage, fee)
                return localId
            }
        }
        cursor = db.query(TABLE_PARKING_LOGS, arrayOf(COL_ID),
            "$COL_LICENSE_PLATE = ? AND $COL_TIME_IN = ?", arrayOf(licensePlate, timeIn), null, null, null)
        cursor.use {
            if (it.moveToFirst()) {
                val localId = it.getLong(0); updateParkingLog(db, localId, licensePlate, timeIn, timeOut, sessionId, serverId, entryImage, exitImage, fee)
                return localId
            }
        }
        val values = ContentValues().apply {
            put(COL_LICENSE_PLATE, licensePlate); put(COL_TIME_IN, timeIn)
            put(COL_TIME_OUT, timeOut); put(COL_SESSION_ID, sessionId)
            put(COL_IS_SYNCED, 1); put(COL_SERVER_ID, serverId)
            if (entryImage != null) put(COL_ENTRY_IMAGE, entryImage)
            if (exitImage != null) put(COL_EXIT_IMAGE, exitImage)
            put(COL_FEE, fee)
        }
        return db.insertOrThrow(TABLE_PARKING_LOGS, null, values)
    }

    private fun updateParkingLog(
        db: SQLiteDatabase, id: Long, lp: String, tin: String, tout: String?, sessionId: Long, sid: Long,
        entryImage: String? = null, exitImage: String? = null, fee: Int = 0,
    ) {
        val values = ContentValues().apply {
            put(COL_LICENSE_PLATE, lp); put(COL_TIME_IN, tin); put(COL_TIME_OUT, tout)
            put(COL_SESSION_ID, sessionId); put(COL_IS_SYNCED, 1); put(COL_SERVER_ID, sid)
            if (entryImage != null) put(COL_ENTRY_IMAGE, entryImage)
            if (exitImage != null) put(COL_EXIT_IMAGE, exitImage)
            put(COL_FEE, fee)
        }
        db.update(TABLE_PARKING_LOGS, values, "$COL_ID = ?", arrayOf(id.toString()))
    }

    fun markAttendantSyncedWithServerId(id: Long, serverId: Long) {
        val values = ContentValues().apply { put(COL_IS_SYNCED, 1); put(COL_SERVER_ID, serverId) }
        writableDatabase.update(TABLE_ATTENDANTS, values, "$COL_ID = ?", arrayOf(id.toString()))
    }

    fun markParkingLogSyncedWithServerId(id: Long, serverId: Long) {
        val values = ContentValues().apply { put(COL_IS_SYNCED, 1); put(COL_SERVER_ID, serverId) }
        writableDatabase.update(TABLE_PARKING_LOGS, values, "$COL_ID = ?", arrayOf(id.toString()))
    }

    fun deleteAttendantAndLogs(localId: Long) {
        val db = writableDatabase
        db.execSQL("DELETE FROM $TABLE_PARKING_LOGS WHERE $COL_SESSION_ID IN (SELECT $COL_ID FROM $TABLE_SESSIONS WHERE $COL_ATTENDANT_ID = $localId)")
        db.delete(TABLE_SESSIONS, "$COL_ATTENDANT_ID = ?", arrayOf(localId.toString()))
        db.delete(TABLE_ATTENDANTS, "$COL_ID = ?", arrayOf(localId.toString()))
    }

    fun clearTable(tableName: String) {
        val db = writableDatabase
        db.delete(tableName, null, null)
    }

    fun clearAllTables() {
        val db = writableDatabase
        db.beginTransaction()
        try {
            db.delete(TABLE_PARKING_LOGS, null, null)
            db.delete(TABLE_ATTENDANTS, null, null)
            db.delete(TABLE_SESSIONS, null, null)
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    // ── Session ──

    fun generateSessionName(): String {
        val today = SimpleDateFormat("dd/MM/yyyy", Locale("vi")).format(Date())
        val db = readableDatabase
        val cursor = db.rawQuery(
            "SELECT COUNT(*) FROM $TABLE_SESSIONS WHERE date($COL_CREATED_AT) = date('now')",
            null
        )
        cursor.use {
            it.moveToFirst()
            val count = it.getInt(0) + 1
            return "Phiên $today #$count"
        }
    }

    fun createSession(name: String, attendantId: Long = 0): Long {
        val db = writableDatabase
        val now = formatNow()
        val values = ContentValues().apply {
            put(COL_SESSION_NAME, name)
            put(COL_SESSION_STATUS, "active")
            put(COL_CREATED_AT, now)
            put(COL_ATTENDANT_ID, attendantId)
        }
        return db.insertOrThrow(TABLE_SESSIONS, null, values)
    }

    fun getOrCreateActiveSession(attendantId: Long): Pair<Session, String?> {
        val db = writableDatabase
        db.beginTransaction()
        try {
            // 1. Try today's active session
            val cursor = db.rawQuery(
                "SELECT * FROM $TABLE_SESSIONS WHERE $COL_SESSION_STATUS = 'active' AND date($COL_CREATED_AT) = date('now') ORDER BY $COL_CREATED_AT DESC LIMIT 1",
                null
            )
            cursor.use {
                if (it.moveToFirst()) {
                    val session = sessionFromCursor(it)
                    db.setTransactionSuccessful()
                    return Pair(session, null)
                }
            }

            // 2. Close any old active sessions (cross-day)
            val oldSessions = mutableListOf<Session>()
            val oldCursor = db.rawQuery(
                "SELECT * FROM $TABLE_SESSIONS WHERE $COL_SESSION_STATUS = 'active' ORDER BY $COL_CREATED_AT DESC",
                null
            )
            oldCursor.use {
                while (it.moveToNext()) oldSessions.add(sessionFromCursor(it))
            }

            val closedOldSessionName = oldSessions.firstOrNull()?.name

            for (sess in oldSessions) {
                val values = ContentValues().apply {
                    put(COL_SESSION_STATUS, "closed")
                    put(COL_ENDED_AT, formatNow())
                    put(COL_IS_SYNCED, 0)
                }
                db.update(TABLE_SESSIONS, values, "$COL_ID = ?", arrayOf(sess.id.toString()))
            }

            // 3. Create new session
            val name = generateSessionName()
            val now = formatNow()
            val values = ContentValues().apply {
                put(COL_SESSION_NAME, name)
                put(COL_SESSION_STATUS, "active")
                put(COL_CREATED_AT, now)
                put(COL_ATTENDANT_ID, attendantId)
            }
            val id = db.insertOrThrow(TABLE_SESSIONS, null, values)
            val session = getSessionById(id) ?: throw IllegalStateException("Session không tìm thấy sau khi tạo")

            db.setTransactionSuccessful()
            return Pair(session, closedOldSessionName)
        } finally {
            db.endTransaction()
        }
    }

    fun getSessionById(id: Long): Session? {
        val db = readableDatabase
        val cursor = db.query(TABLE_SESSIONS, null, "$COL_ID = ?",
            arrayOf(id.toString()), null, null, null)
        return cursor.use {
            if (it.moveToFirst()) sessionFromCursor(it) else null
        }
    }

    fun getActiveSession(): Session? {
        val db = readableDatabase
        val cursor = db.query(TABLE_SESSIONS, null, "$COL_SESSION_STATUS = ?",
            arrayOf("active"), null, null, "$COL_CREATED_AT DESC", "1")
        return cursor.use {
            if (it.moveToFirst()) sessionFromCursor(it) else null
        }
    }

    fun endSession(id: Long): Int {
        val db = writableDatabase
        val now = formatNow()
        val values = ContentValues().apply {
            put(COL_SESSION_STATUS, "closed")
            put(COL_ENDED_AT, now)
            put(COL_IS_SYNCED, 0)
        }
        return db.update(TABLE_SESSIONS, values, "$COL_ID = ?", arrayOf(id.toString()))
    }

    fun getRemainingCount(sessionId: Long): Int {
        val db = readableDatabase
        val cursor = db.rawQuery(
            "SELECT COUNT(*) FROM $TABLE_PARKING_LOGS WHERE $COL_SESSION_ID = ? AND $COL_TIME_OUT IS NULL",
            arrayOf(sessionId.toString())
        )
        return cursor.use {
            it.moveToFirst()
            it.getInt(0)
        }
    }

    fun getUnsyncedSessions(): List<Session> {
        return querySessions("$COL_IS_SYNCED = 0", null)
    }

    fun getAllSessionsForAttendant(attendantId: Long): List<Session> {
        return querySessions("$COL_ATTENDANT_ID = ?", arrayOf(attendantId.toString()))
    }

    fun getAllSessions(): List<Session> {
        return querySessions(null, null)
    }

    fun markSessionSyncedWithServerId(id: Long, serverId: Long) {
        val values = ContentValues().apply { put(COL_IS_SYNCED, 1); put(COL_SERVER_ID, serverId) }
        writableDatabase.update(TABLE_SESSIONS, values, "$COL_ID = ?", arrayOf(id.toString()))
    }

    // ── Dump ──

    fun dumpAllTables(): String {
        val sb = StringBuilder()
        sb.appendLine("=== ATTENDANTS ===")
        queryAttendants(null, null).forEach { a ->
            sb.appendLine("  id=${a.id} uid=${a.uid} email=${a.email} synced=${a.isSynced} serverId=${a.serverId} jwt=${if (a.jwtToken != null) "yes" else "no"} hash=${if (a.passwordHash != null) "yes" else "no"} refresh=${if (a.refreshToken != null) "yes" else "no"}")
        }
        sb.appendLine("--- PARKING_LOGS ---")
        getAllParkingLogs().forEach { p ->
            sb.appendLine("  id=${p.id} plate=${p.licensePlate} in=${p.timeIn} out=${p.timeOut} session=${p.sessionId} synced=${p.isSynced} serverId=${p.serverId} fee=${p.fee}")
        }
        sb.appendLine("====================")
        return sb.toString()
    }

    // ── Internal ──

    private fun queryLogs(
        selection: String?,
        selectionArgs: Array<String>?,
        orderBy: String,
        limit: Int = 1000,
        offset: Int = 0,
    ): List<ParkingLog> {
        val db = readableDatabase
        val cursor = db.query(TABLE_PARKING_LOGS, null, selection, selectionArgs,
            null, null, "$orderBy LIMIT $limit OFFSET $offset")
        val list = mutableListOf<ParkingLog>()
        cursor.use { while (it.moveToNext()) list.add(parkingLogFromCursor(it)) }
        return list
    }

    private fun queryAttendants(selection: String?, selectionArgs: Array<String>?): List<Attendant> {
        val db = readableDatabase
        val cursor = db.query(TABLE_ATTENDANTS, null, selection, selectionArgs, null, null, null)
        val list = mutableListOf<Attendant>()
        cursor.use { while (it.moveToNext()) list.add(attendantFromCursor(it)) }
        return list
    }

    private fun attendantFromCursor(c: Cursor) = Attendant(
        id = c.getLong(c.getColumnIndexOrThrow(COL_ID)),
        uid = c.getString(c.getColumnIndexOrThrow(COL_UID)) ?: "",
        email = c.getString(c.getColumnIndexOrThrow(COL_EMAIL)),
        passwordHash = if (c.isNull(c.getColumnIndexOrThrow(COL_PASSWORD_HASH))) null
                       else c.getString(c.getColumnIndexOrThrow(COL_PASSWORD_HASH)),
        refreshToken = if (c.isNull(c.getColumnIndexOrThrow(COL_REFRESH_TOKEN))) null
                       else c.getString(c.getColumnIndexOrThrow(COL_REFRESH_TOKEN)),
        isSynced = c.getInt(c.getColumnIndexOrThrow(COL_IS_SYNCED)) == 1,
        serverId = if (c.isNull(c.getColumnIndexOrThrow(COL_SERVER_ID))) null
                   else c.getLong(c.getColumnIndexOrThrow(COL_SERVER_ID)),
        jwtToken = if (c.isNull(c.getColumnIndexOrThrow(COL_JWT))) null
                   else c.getString(c.getColumnIndexOrThrow(COL_JWT)),
    )

    private fun querySessions(selection: String?, selectionArgs: Array<String>?): List<Session> {
        val db = readableDatabase
        val cursor = db.query(TABLE_SESSIONS, null, selection, selectionArgs, null, null, "$COL_CREATED_AT DESC")
        val list = mutableListOf<Session>()
        cursor.use { while (it.moveToNext()) list.add(sessionFromCursor(it)) }
        return list
    }

    private fun sessionFromCursor(c: Cursor) = Session(
        id = c.getLong(c.getColumnIndexOrThrow(COL_ID)),
        name = c.getString(c.getColumnIndexOrThrow(COL_SESSION_NAME)),
        status = c.getString(c.getColumnIndexOrThrow(COL_SESSION_STATUS)),
        createdAt = c.getString(c.getColumnIndexOrThrow(COL_CREATED_AT)),
        endedAt = if (c.isNull(c.getColumnIndexOrThrow(COL_ENDED_AT))) null
                  else c.getString(c.getColumnIndexOrThrow(COL_ENDED_AT)),
        isSynced = c.getInt(c.getColumnIndexOrThrow(COL_IS_SYNCED)) == 1,
        serverId = if (c.isNull(c.getColumnIndexOrThrow(COL_SERVER_ID))) null
                   else c.getLong(c.getColumnIndexOrThrow(COL_SERVER_ID)),
        attendantId = c.getLong(c.getColumnIndexOrThrow(COL_ATTENDANT_ID)),
    )

    private fun parkingLogFromCursor(c: Cursor) = ParkingLog(
        id = c.getLong(c.getColumnIndexOrThrow(COL_ID)),
        licensePlate = c.getString(c.getColumnIndexOrThrow(COL_LICENSE_PLATE)),
        timeIn = c.getString(c.getColumnIndexOrThrow(COL_TIME_IN)),
        timeOut = if (c.isNull(c.getColumnIndexOrThrow(COL_TIME_OUT))) null
                  else c.getString(c.getColumnIndexOrThrow(COL_TIME_OUT)),
        sessionId = c.getLong(c.getColumnIndexOrThrow(COL_SESSION_ID)),
        isSynced = c.getInt(c.getColumnIndexOrThrow(COL_IS_SYNCED)) == 1,
        serverId = if (c.isNull(c.getColumnIndexOrThrow(COL_SERVER_ID))) null
                   else c.getLong(c.getColumnIndexOrThrow(COL_SERVER_ID)),
        entryImage = if (c.isNull(c.getColumnIndexOrThrow(COL_ENTRY_IMAGE))) null
                     else c.getString(c.getColumnIndexOrThrow(COL_ENTRY_IMAGE)),
        exitImage = if (c.isNull(c.getColumnIndexOrThrow(COL_EXIT_IMAGE))) null
                    else c.getString(c.getColumnIndexOrThrow(COL_EXIT_IMAGE)),
        fee = c.getInt(c.getColumnIndexOrThrow(COL_FEE)),
    )
}
