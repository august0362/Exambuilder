package com.exambuilder.android.viewmodel

import android.app.Application
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.SystemClock
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.exambuilder.android.update.AndroidRelease
import com.exambuilder.android.update.GitHubUpdateClient
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.File

data class AppUpdateState(
    val online: Boolean = false,
    val checking: Boolean = false,
    val downloading: Boolean = false,
    val progress: Float = 0f,
    val release: AndroidRelease? = null,
    val readyApk: File? = null,
    val message: String? = null,
    val dismissed: Boolean = false
)

class AppUpdateViewModel(app: Application) : AndroidViewModel(app) {
    private val client = GitHubUpdateClient(app)
    private val connectivity = app.getSystemService(ConnectivityManager::class.java)
    private val _state = MutableStateFlow(AppUpdateState())
    val state = _state.asStateFlow()
    private var nextAutomaticCheck = 0L

    init {
        viewModelScope.launch {
            callbackFlow {
                fun publish() { trySend(isOnline()) }
                val callback = object : ConnectivityManager.NetworkCallback() {
                    override fun onAvailable(network: Network) = publish()
                    override fun onLost(network: Network) = publish()
                    override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) = publish()
                }
                connectivity.registerDefaultNetworkCallback(callback)
                publish()
                awaitClose { connectivity.unregisterNetworkCallback(callback) }
            }.distinctUntilChanged().collect { online ->
                _state.update { it.copy(online = online) }
                if (online) checkForUpdates()
            }
        }
    }

    private fun isOnline(): Boolean {
        val capabilities = connectivity.getNetworkCapabilities(connectivity.activeNetwork) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    fun checkForUpdates(manual: Boolean = false) {
        if (_state.value.checking || _state.value.downloading) return
        val online = isOnline()
        _state.update { it.copy(online = online) }
        if (!online) {
            if (manual) report("Chưa có kết nối Internet. Ứng dụng sẽ kiểm tra khi có mạng.")
            return
        }
        if (!manual && SystemClock.elapsedRealtime() < nextAutomaticCheck) return
        _state.update { it.copy(checking = true, message = null) }
        viewModelScope.launch {
            try {
                val release = client.latest()
                nextAutomaticCheck = SystemClock.elapsedRealtime() + 6 * 60 * 60 * 1000L
                _state.update {
                    it.copy(
                        release = release,
                        readyApk = it.readyApk?.takeIf { file -> file.isFile && it.release?.manifest == release?.manifest },
                        dismissed = it.dismissed && it.release?.manifest == release?.manifest,
                        message = if (release == null) "Bạn đang dùng phiên bản mới nhất." else null
                    )
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                nextAutomaticCheck = SystemClock.elapsedRealtime() + 5 * 60 * 1000L
                report(e.message ?: "Không thể kiểm tra cập nhật. Hãy thử lại sau.")
            } finally {
                _state.update { it.copy(checking = false) }
            }
        }
    }

    fun download() {
        val release = _state.value.release ?: return
        if (_state.value.downloading || _state.value.checking) return
        if (!isOnline()) {
            _state.update { it.copy(online = false) }
            report("Cần kết nối Internet để tải bản cập nhật.")
            return
        }
        _state.update { it.copy(downloading = true, progress = 0f, message = null) }
        viewModelScope.launch {
            try {
                val file = client.download(release) { progress -> _state.update { it.copy(progress = progress) } }
                _state.update { it.copy(readyApk = file, message = "Đã tải xong. Bấm Cài đặt để cập nhật ứng dụng.") }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                report(e.message ?: "Không tải được APK. Hãy kiểm tra kết nối và thử lại.")
            } finally {
                _state.update { it.copy(downloading = false) }
            }
        }
    }

    fun dismissBanner() { _state.update { it.copy(dismissed = true) } }

    fun report(message: String) { _state.update { it.copy(message = message) } }

    fun installationFailed(message: String) {
        _state.update { it.copy(readyApk = it.readyApk?.takeIf { file -> file.isFile }, message = message) }
    }
}
