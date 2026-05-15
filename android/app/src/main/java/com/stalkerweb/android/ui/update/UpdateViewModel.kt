package com.stalkerweb.android.ui.update

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.stalkerweb.android.data.update.ReleaseInfo
import com.stalkerweb.android.data.update.UpdateManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.io.File

sealed class UpdateState {
    object Idle : UpdateState()
    data class Available(val release: ReleaseInfo) : UpdateState()
    data class Downloading(val progress: Float) : UpdateState()
    data class ReadyToInstall(val file: File) : UpdateState()
}

class UpdateViewModel(private val manager: UpdateManager) : ViewModel() {

    private val _state = MutableStateFlow<UpdateState>(UpdateState.Idle)
    val state: StateFlow<UpdateState> = _state.asStateFlow()

    fun check() {
        viewModelScope.launch {
            val info = manager.checkForUpdate() ?: return@launch
            _state.value = UpdateState.Available(info)
        }
    }

    fun download(release: ReleaseInfo) {
        _state.value = UpdateState.Downloading(0f)
        viewModelScope.launch {
            runCatching {
                val file = manager.downloadApk(release.apkUrl) { progress ->
                    _state.value = UpdateState.Downloading(progress)
                }
                _state.value = UpdateState.ReadyToInstall(file)
            }.onFailure {
                _state.value = UpdateState.Available(release)
            }
        }
    }

    fun install(file: File) = manager.installApk(file)

    fun dismiss() { _state.value = UpdateState.Idle }
}
