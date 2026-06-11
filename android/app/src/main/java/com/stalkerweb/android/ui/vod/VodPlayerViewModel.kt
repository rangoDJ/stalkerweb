package com.stalkerweb.android.ui.vod

import android.app.Application
import android.content.ComponentName
import androidx.annotation.OptIn
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.MimeTypes
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors
import com.stalkerweb.android.data.repository.ChannelRepository
import com.stalkerweb.android.service.PlaybackService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

@OptIn(UnstableApi::class)
class VodPlayerViewModel(
    application: Application,
    private val repository: ChannelRepository,
) : AndroidViewModel(application) {

    private val _player = MutableStateFlow<Player?>(null)
    val player: StateFlow<Player?> = _player.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _loading = MutableStateFlow(true)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    private var controllerFuture: ListenableFuture<MediaController>? = null
    private var pendingPlay: (() -> Unit)? = null
    private var started = false

    fun init(videoId: String, cmd: String, series: String, seasonId: String, episodeId: String, title: String) {
        if (started) return
        started = true

        val token  = SessionToken(getApplication(), ComponentName(getApplication(), PlaybackService::class.java))
        val future = MediaController.Builder(getApplication(), token).buildAsync()
        controllerFuture = future
        future.addListener({
            val controller = runCatching { future.get() }
                .onFailure { android.util.Log.e("VodPlayerVM", "controller connect failed", it) }
                .getOrNull()
            if (controller != null) {
                _player.value = controller
                pendingPlay?.invoke()
                pendingPlay = null
            }
        }, MoreExecutors.directExecutor())

        viewModelScope.launch {
            runCatching {
                repository.resolveVodStreamUrl(videoId, cmd, series, seasonId, episodeId)
            }.onSuccess { url ->
                val play = { startPlayback(url, title) }
                if (_player.value != null) play() else pendingPlay = play
            }.onFailure {
                _loading.value = false
                _error.value = it.message ?: "Could not load video"
            }
        }
    }

    private fun startPlayback(url: String, title: String) {
        val p = _player.value ?: return
        val builder = MediaItem.Builder()
            .setUri(url)
            .setMediaMetadata(MediaMetadata.Builder().setTitle(title).build())
        if (url.substringBefore('?').endsWith(".m3u8", ignoreCase = true)) {
            builder.setMimeType(MimeTypes.APPLICATION_M3U8)
        }
        p.setMediaItem(builder.build())
        p.prepare()
        p.playWhenReady = true
        _loading.value = false
    }

    override fun onCleared() {
        _player.value?.pause()
        controllerFuture?.let { MediaController.releaseFuture(it) }
        super.onCleared()
    }
}
