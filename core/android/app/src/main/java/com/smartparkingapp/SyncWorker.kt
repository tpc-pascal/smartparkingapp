package com.smartparkingapp

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

class SyncWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        if (runAttemptCount > 3) {
            LogBuffer.add("[SYNC] Max retries exceeded ($runAttemptCount), giving up")
            return Result.failure()
        }
        LogBuffer.add("[SYNC] SyncWorker started (attempt $runAttemptCount)")
        val db = DatabaseHelper(applicationContext)
        val prefs = applicationContext.getSharedPreferences("session", Context.MODE_PRIVATE)
        val syncPrefs = applicationContext.getSharedPreferences("sync", Context.MODE_PRIVATE)
        var jwt = prefs.getString("jwt", null)
        if (jwt == null) {
            LogBuffer.add("[SYNC] No JWT, skipping sync")
            return Result.success()
        }

        var api = SupabaseApi(jwt)
        var hasFailure = false
        var jwtRefreshed = false

        // ── Phase 1: Push unsynced attendants ──
        val attendants = db.getUnsyncedAttendants()
        LogBuffer.add("[SYNC] Pushing ${attendants.size} unsynced attendants")
        for (att in attendants) {
            var serverId = api.pushAttendant(att.uid, att.email)
            if (serverId == null && !jwtRefreshed) {
                val newJwt = refreshJwt(applicationContext, db, prefs)
                if (newJwt != null) {
                    jwtRefreshed = true
                    api = SupabaseApi(newJwt)
                    serverId = api.pushAttendant(att.uid, att.email)
                }
            }
            if (serverId != null) {
                db.markAttendantSyncedWithServerId(att.id, serverId)
            } else {
                hasFailure = true
            }
        }

        // ── Phase 2: Push unsynced sessions ──
        val sessions = db.getUnsyncedSessions()
        LogBuffer.add("[SYNC] Pushing ${sessions.size} unsynced sessions")
        for (sess in sessions) {
            val att = if (sess.attendantId > 0) db.getAttendantById(sess.attendantId) else null
            val serverAttId = att?.serverId
            var serverId = api.pushSession(sess.name, sess.createdAt, sess.status, serverAttId)
            if (serverId == null && !jwtRefreshed) {
                val newJwt = refreshJwt(applicationContext, db, prefs)
                if (newJwt != null) {
                    jwtRefreshed = true
                    api = SupabaseApi(newJwt)
                    serverId = api.pushSession(sess.name, sess.createdAt, sess.status, serverAttId)
                }
            }
            if (serverId != null) {
                db.markSessionSyncedWithServerId(sess.id, serverId)
                // If session is closed, also update server status
                if (sess.status == "closed") {
                    api.updateSessionStatus(serverId, "closed")
                }
            } else {
                hasFailure = true
            }
        }

        // ── Phase 3: Push unsynced parking logs ──
        val logs = db.getUnsyncedParkingLogs()
        LogBuffer.add("[SYNC] Pushing ${logs.size} unsynced parking logs")
        for (log in logs) {
            val sess = db.getSessionById(log.sessionId)
            val serverSessId = sess?.serverId
            if (serverSessId == null) {
                LogBuffer.add("[SYNC] Skipping parking log ${log.id} because its session ${log.sessionId} has no serverId (not synced yet)")
                hasFailure = true
                continue
            }
            val logToPush = log.copy(sessionId = serverSessId)
            var serverId = api.pushParkingLog(logToPush)
            if (serverId == null && !jwtRefreshed) {
                val newJwt = refreshJwt(applicationContext, db, prefs)
                if (newJwt != null) {
                    jwtRefreshed = true
                    api = SupabaseApi(newJwt)
                    serverId = api.pushParkingLog(logToPush)
                }
            }
            if (serverId != null) {
                db.markParkingLogSyncedWithServerId(log.id, serverId)
            } else {
                hasFailure = true
            }
        }

        // ── Phase 4: Pull remote parking logs since last sync ──
        val lastSync = syncPrefs.getString("last_sync_timestamp", null)
        LogBuffer.add("[SYNC] Last sync timestamp: $lastSync")
        val remoteLogs = api.fetchMyParkingLogsSince(lastSync)
        LogBuffer.add("[SYNC] Pulling ${remoteLogs.size} remote parking logs")
        for (pl in remoteLogs) {
            try {
                db.upsertParkingLogFromServer(
                    serverId = pl.serverId ?: continue,
                    licensePlate = pl.licensePlate,
                    timeIn = pl.timeIn,
                    timeOut = pl.timeOut,
                    sessionId = pl.sessionId,
                    entryImage = pl.entryImage,
                    exitImage = pl.exitImage,
                    fee = pl.fee,
                )
            } catch (e: Exception) {
                LogBuffer.add("[SYNC] Failed upsert remote parking log: ${e.message}")
            }
        }

        // ── Phase 5: Upload pending images (local path → Supabase storage) ──
        val pendingLogs = db.getParkingLogsWithPendingImages()
        if (pendingLogs.isNotEmpty()) {
            LogBuffer.add("[SYNC] Uploading ${pendingLogs.size} pending images")
            val localId = prefs.getLong("id", -1L)
            val att = if (localId != -1L) db.getAttendantById(localId) else null
            val uid = att?.uid ?: "unknown"
            for (log in pendingLogs) {
                if (log.entryImage != null && !log.entryImage.startsWith("http")) {
                    val ts = log.timeIn.replace(":", "-").replace("T", "_").substringBefore("Z")
                    val remotePath = "${uid}_${ts}_${log.licensePlate}_sync_${log.id}.jpg"
                    val publicUrl = api.uploadImage(log.entryImage, remotePath)
                    if (publicUrl != null) {
                        db.updateEntryImage(log.id, publicUrl)
                        if (log.serverId != null) {
                            api.updateParkingLogImage(log.serverId, publicUrl, null)
                        }
                        LogBuffer.add("[SYNC] Entry image uploaded for log ${log.id}: $publicUrl")
                    } else {
                        hasFailure = true
                    }
                }
                if (log.exitImage != null && !log.exitImage.startsWith("http")) {
                    val ts = (log.timeOut ?: DatabaseHelper.formatNow()).replace(":", "-").replace("T", "_").substringBefore("Z")
                    val remotePath = "${uid}_exit_${ts}_${log.licensePlate}_sync_${log.id}.jpg"
                    val publicUrl = api.uploadImage(log.exitImage, remotePath)
                    if (publicUrl != null) {
                        db.updateExitImage(log.id, publicUrl)
                        if (log.serverId != null) {
                            api.updateParkingLogImage(log.serverId, null, publicUrl)
                        }
                        LogBuffer.add("[SYNC] Exit image uploaded for log ${log.id}: $publicUrl")
                    } else {
                        hasFailure = true
                    }
                }
            }
        }

        // Update last sync timestamp
        val now = DatabaseHelper.formatNow()
        syncPrefs.edit().putString("last_sync_timestamp", now).apply()
        LogBuffer.add("[SYNC] Updated last sync: $now")

        LogBuffer.add("[SYNC] SyncWorker finished, hasFailure=$hasFailure")
        return if (hasFailure) Result.retry() else Result.success()
    }

    private suspend fun refreshJwt(ctx: Context, db: DatabaseHelper, prefs: android.content.SharedPreferences): String? {
        val localId = prefs.getLong("id", -1L)
        if (localId == -1L) return null
        val att = db.getAttendantById(localId) ?: return null
        val refreshToken = att.refreshToken ?: return null
        val api = SupabaseApi()
        val result = api.refreshToken(refreshToken) ?: return null
        db.updateJwtAndRefresh(localId, result.jwt, result.refreshToken)
        prefs.edit().apply {
            putLong("id", localId)
            putString("email", att.email)
            putString("fullName", att.email)
            putString("jwt", result.jwt)
            apply()
        }
        LogBuffer.add("[SYNC] JWT refreshed for ${att.email}")
        return result.jwt
    }
}
