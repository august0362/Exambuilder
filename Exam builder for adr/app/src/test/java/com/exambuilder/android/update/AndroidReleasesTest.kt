package com.exambuilder.android.update

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.fail
import org.junit.Test

class AndroidReleasesTest {
    private val repository = "august0362/Exambuilder"
    private val apk = ReleaseAsset("ExamBuilder.apk", "https://github.com/$repository/releases/download/android-v1.2.0/ExamBuilder.apk", 1024)
    private val assets = listOf(apk)
    private fun manifest(code: Int = 3, minSdk: Int = 26, hash: String = "a".repeat(64), name: String = "ExamBuilder.apk") =
        """{"versionCode":$code,"versionName":"1.2.0","minSdk":$minSdk,"apkName":"$name","sha256":"$hash"}"""

    private fun reject(block: () -> Unit) {
        try {
            block()
            fail("Phai tu choi metadata khong hop le")
        } catch (_: IllegalStateException) {
        }
    }

    @Test fun offersOnlyHigherVersionCodes() {
        assertNotNull(AndroidReleases.newerRelease(manifest(), assets, "Moi", currentCode = 2, sdk = 26))
        assertNull(AndroidReleases.newerRelease(manifest(), assets, "", currentCode = 3, sdk = 36))
        assertNull(AndroidReleases.newerRelease(manifest(), assets, "", currentCode = 4, sdk = 36))
    }

    @Test fun versionNameDoesNotDecideUpgradeOrder() {
        val raw = manifest(4).replace("1.2.0", "1.0.0")
        assertEquals(4, AndroidReleases.newerRelease(raw, assets, "", 3, 36)?.manifest?.versionCode)
    }

    @Test fun rejectsIncompatibleAndroidVersion() {
        reject { AndroidReleases.newerRelease(manifest(minSdk = 35), assets, "", 2, 34) }
    }

    @Test fun requiresSha256() {
        reject { AndroidReleases.newerRelease(manifest(hash = ""), assets, "", 2, 36) }
        reject { AndroidReleases.newerRelease(manifest(hash = "g".repeat(64)), assets, "", 2, 36) }
        assertNotNull(AndroidReleases.newerRelease(manifest(hash = "A".repeat(64)), assets, "", 2, 36))
    }

    @Test fun rejectsMissingOrAmbiguousApk() {
        reject { AndroidReleases.newerRelease(manifest(), emptyList(), "", 2, 36) }
        reject { AndroidReleases.newerRelease(manifest(), assets + apk, "", 2, 36) }
        reject { AndroidReleases.newerRelease(manifest(name = "../other.apk"), assets, "", 2, 36) }
    }

    @Test fun boundsDownloadSize() {
        for (size in listOf(0L, -1L, AndroidReleases.MAX_APK_BYTES + 1)) {
            reject { AndroidReleases.newerRelease(manifest(), listOf(apk.copy(size = size)), "", 2, 36) }
        }
    }

    @Test fun requiresPositiveVersionCode() {
        reject { AndroidReleases.newerRelease(manifest(code = 0), assets, "", 2, 36) }
    }

    @Test fun readsStableGitHubReleaseAndNotes() {
        val raw = """{"draft":false,"prerelease":false,"body":"Sua dong bo","assets":[{"name":"ExamBuilder.apk","browser_download_url":"${apk.browser_download_url}","size":1024}],"extra":true}"""
        val (actualAssets, notes) = AndroidReleases.assets(raw, repository)
        assertEquals(assets, actualAssets)
        assertEquals("Sua dong bo", notes)
    }

    @Test fun ignoresDraftsAndPrereleases() {
        reject { AndroidReleases.assets("""{"draft":true,"prerelease":false,"assets":[]}""", repository) }
        reject { AndroidReleases.assets("""{"draft":false,"prerelease":true,"assets":[]}""", repository) }
    }

    @Test fun acceptsOnlyHttpsAssetsFromSelectedRepository() {
        AndroidReleases.checkDownloadUrl(apk.browser_download_url, repository)
        for (url in listOf(
            apk.browser_download_url.replace("https:", "http:"),
            apk.browser_download_url.replace("github.com", "github.com.evil.test"),
            apk.browser_download_url.replace(repository, "someone/other"),
            apk.browser_download_url.replace("/releases/download/", "/blob/main/"),
            apk.browser_download_url.replace("github.com", "github.com@evil.test"),
            apk.browser_download_url.replace("github.com", "github.com:443")
        )) reject { AndroidReleases.checkDownloadUrl(url, repository) }
    }

    @Test fun validatesAssetUrlsBeforeReadingManifest() {
        val raw = """{"draft":false,"prerelease":false,"assets":[{"name":"android-update.json","browser_download_url":"https://evil.test/metadata","size":500}]}"""
        reject { AndroidReleases.assets(raw, repository) }
    }
}
