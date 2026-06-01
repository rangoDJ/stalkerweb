package com.stalkerweb.android.ui.player

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
import com.stalkerweb.android.data.api.Channel
import com.stalkerweb.android.data.repository.ChannelRepository
import com.stalkerweb.android.service.PlaybackService
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class PlayerUiState(
    val channels: List<Channel>      = emptyList(),
    val logoMap: Map<String, String> = emptyMap(),
    val favoriteIds: Set<String>     = emptySet(),
    val activeChannelId: String      = "",
    val showChannelList: Boolean     = false,
    val selectedGenre: String?       = null,
) {
    val genres: List<String>
        get() = channels.mapNotNull { it.genre }.filter { it.isNotBlank() }.distinct().sorted()

    val displayedChannels: List<Channel>
        get() = if (selectedGenre == null) channels
                else channels.filter { it.genre == selectedGenre }
}

@OptIn(UnstableApi::class)
class PlayerViewModel(
    application: Application,
    private val repository: ChannelRepository,
) : AndroidViewModel(application) {

    private val _state = MutableStateFlow(PlayerUiState())
    val state: StateFlow<PlayerUiState> = _state.asStateFlow()

    private val _player = MutableStateFlow<Player?>(null)
    val player: StateFlow<Player?> = _player.asStateFlow()

    private var controllerFuture: ListenableFuture<MediaController>? = null

    fun init(channelId: String) {
        _state.value = _state.value.copy(activeChannelId = channelId)

        // Connect to PlaybackService — starts it if not already running
        val token = SessionToken(getApplication(), ComponentName(getApplication(), PlaybackService::class.java))
        val future = MediaController.Builder(getApplication(), token).buildAsync()
        controllerFuture = future
        future.addListener({
            _player.value = future.get()
            loadStream(channelId)
        }, MoreExecutors.directExecutor())

        viewModelScope.launch {
            runCatching {
                val channels = async { repository.getChannels() }
                val logos    = async { repository.getLogoMap() }
                val favs     = async { repository.getFavoriteIds() }
                Triple(channels.await(), logos.await(), favs.await())
            }.onSuccess { (channels, logos, favs) ->
                val firstGenre = channels.mapNotNull { it.genre }
                    .filter { it.isNotBlank() }.distinct().sorted().firstOrNull()
                _state.value = _state.value.copy(
                    channels      = channels,
                    logoMap       = logos,
                    favoriteIds   = favs,
                    selectedGenre = firstGenre,
                )
            }
        }
    }

    fun loadStream(channelId: String) {
        val p = _player.value ?: return
        val channel = _state.value.channels.find { it.uniqueId == channelId }
        val item = MediaItem.Builder()
            .setUri(repository.streamUrl(channelId))
            .setMimeType(MimeTypes.APPLICATION_M3U8)
            .setMediaMetadata(MediaMetadata.Builder().setTitle(channel?.name).build())
            .build()
        p.setMediaItem(item)
        p.prepare()
        p.playWhenReady = true
        if (channel != null) {
            repository.pushWatched(channel, _state.value.logoMap[channelId])
        }
    }

    fun selectChannel(channelId: String) {
        _state.value = _state.value.copy(
            activeChannelId = channelId,
            showChannelList = false,
        )
        loadStream(channelId)
    }

    fun toggleChannelList() {
        _state.value = _state.value.copy(showChannelList = !_state.value.showChannelList)
    }

    fun setGenre(genre: String?) {
        _state.value = _state.value.copy(selectedGenre = genre)
    }

    fun toggleFavorite(channel: Channel) {
        val id    = channel.uniqueId
        val isFav = id in _state.value.favoriteIds
        _state.value = _state.value.copy(
            favoriteIds = if (isFav) _state.value.favoriteIds - id
                          else _state.value.favoriteIds + id,
        )
        viewModelScope.launch {
            runCatching {
                if (isFav) repository.removeFavorite(id) else repository.addFavorite(id)
            }.onFailure {
                _state.value = _state.value.copy(
                    favoriteIds = if (isFav) _state.value.favoriteIds + id
                                  else _state.value.favoriteIds - id,
                )
            }
        }
    }

    fun previousChannel(): Boolean {
        val channels = _state.value.displayedChannels
        val idx = channels.indexOfFirst { it.uniqueId == _state.value.activeChannelId }
        if (idx > 0) { selectChannel(channels[idx - 1].uniqueId); return true }
        return false
    }

    fun nextChannel(): Boolean {
        val channels = _state.value.displayedChannels
        val idx = channels.indexOfFirst { it.uniqueId == _state.value.activeChannelId }
        if (idx >= 0 && idx < channels.size - 1) { selectChannel(channels[idx + 1].uniqueId); return true }
        return false
    }

    override fun onCleared() {
        controllerFuture?.let { MediaController.releaseFuture(it) }
        super.onCleared()
    }
}
