package com.exambuilder.android.sync

import com.exambuilder.android.BuildConfig
import com.exambuilder.android.data.SyncSettings
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AutoPullPolicyTest {
    @Test fun freshInstallReadsSharedLibraryWithoutToken() {
        val settings = SyncSettings()
        assertEquals(BuildConfig.SHARED_GIST_ID, settings.gistId)
        assertTrue(settings.isSharedGist)
        assertFalse(settings.hasToken)
        assertTrue(AutoPullPolicy().shouldPull(settings, online = true, now = 0))
    }

    @Test fun offlineDisabledAndExplicitPersonalSetupDoNotPull() {
        val policy = AutoPullPolicy()
        assertFalse(policy.shouldPull(SyncSettings(), online = false, now = 0))
        assertFalse(policy.shouldPull(SyncSettings(autoPull = false), online = true, now = 0))
        assertFalse(policy.shouldPull(SyncSettings(gistId = ""), online = true, now = 0))
    }

    @Test fun reconnectCanPullWhenInitialLaunchWasOffline() {
        val policy = AutoPullPolicy()
        assertFalse(policy.shouldPull(SyncSettings(), online = false, now = 10))
        assertTrue(policy.shouldPull(SyncSettings(), online = true, now = 11))
    }

    @Test fun resumeAndNetworkCallbacksShareOneCooldown() {
        val policy = AutoPullPolicy()
        policy.recordAttempt(BuildConfig.SHARED_GIST_ID, 100)
        assertFalse(policy.shouldPull(SyncSettings(), online = true, now = 100))
        assertFalse(policy.shouldPull(SyncSettings(), online = true, now = 60099))
        assertTrue(policy.shouldPull(SyncSettings(), online = true, now = 60100))
    }

    @Test fun changingSourceOrEnablingAutoPullAllowsImmediatePull() {
        val policy = AutoPullPolicy()
        policy.recordAttempt(BuildConfig.SHARED_GIST_ID, 100)
        assertTrue(policy.shouldPull(SyncSettings(gistId = "another"), online = true, now = 101))
        policy.reset()
        assertTrue(policy.shouldPull(SyncSettings(), online = true, now = 101))
    }
}
