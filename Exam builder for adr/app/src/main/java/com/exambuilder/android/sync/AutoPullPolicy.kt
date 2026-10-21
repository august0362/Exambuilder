package com.exambuilder.android.sync

import com.exambuilder.android.data.SyncSettings

/** Tranh Pull lap khi onResume va su kien co mang den cung luc. */
class AutoPullPolicy(private val cooldownMs: Long = 60_000) {
    private var lastGistId: String? = null
    private var lastAttempt: Long? = null

    fun shouldPull(settings: SyncSettings, online: Boolean, now: Long): Boolean {
        if (!settings.autoPull || settings.gistId.isBlank() || !online) return false
        val previous = lastAttempt ?: return true
        return settings.gistId != lastGistId || now - previous >= cooldownMs
    }

    fun recordAttempt(gistId: String, now: Long) {
        lastGistId = gistId
        lastAttempt = now
    }

    fun reset() {
        lastGistId = null
        lastAttempt = null
    }
}
