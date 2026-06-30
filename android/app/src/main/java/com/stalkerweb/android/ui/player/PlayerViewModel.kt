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
import com.stalkerweb.android.cast.CastManager
import com.stalkerweb.android.data.api.Channel
import com.stalkerweb.android.data.repository.ChannelRepository
import com.stalkerweb.android.service.PlaybackService
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class PlayerUiState(
    val channels: List<Channel>        = emptyList(),
    val logoMap: Map<String, String>   = emptyMap(),
    val favoriteIds: Set<String>       = emptySet(),
    val activeChannelId: String        = "",
    val showChannelList: Boolean       = false,
    val selectedGenre: String?         = null,
    val sleepTimerEndsAt: Long?        = null,
    val overrideSheetChannel: Channel? = null,
    val isCasting: Boolean             = false,
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
    private var sleepTimerJob: Job? = null

    val castManager: CastManager? = runCatching { CastManager(application) }.getOrNull()

    init {
        // Mirror cast session state into UI state
        castManager?.let { cm ->
            viewModelScope.launch {
                cm.isCasting.collect { casting ->
                    _state.value = _state.value.copy(isCasting = casting)
                }
            }
        }
    }

    fun init(channelId: String) {
        // Seed from the on-disk cache so channel navigation/metadata work instantly
        // while the network refresh runs below.
        val cached = repository.getCachedChannels()
        _state.value = _state.value.copy(
            activeChannelId = channelId,
            channels        = if (cached.isNotEmpty()) cached else _state.value.channels,
            logoMap         = repository.getCachedLogoMap().ifEmpty { _state.value.logoMap },
        )

        // Reuse an existing connected MediaController; if the previous one disconnected
        // (PlaybackService was stopped while the app was in the background) fall through
        // and reconnect so player operations don't throw on a stale reference.
        val existingController = _player.value as? MediaController
        if (existingController != null) {
            if (existingController.isConnected) {
                loadStream(channelId)
                return
            }
            // Stale disconnected controller — clear it so we reconnect below.
            _player.value = null
        }

        // Connect to PlaybackService — starts it if not already running
        val token = SessionToken(getApplication(), ComponentName(getApplication(), PlaybackService::class.java))
        val future = MediaController.Builder(getApplication(), token).buildAsync()
        controllerFuture = future
        future.addListener({
            // future.get() runs on the main thread (directExecutor); if the
            // PlaybackService connection fails it throws, which would otherwise
            // crash the app on every channel open. Guard it.
            val controller = runCatching { future.get() }
                .onFailure { android.util.Log.e("PlayerViewModel", "MediaController connect failed", it) }
                .getOrNull()
            if (controller != null) {
                _player.value = controller
                loadStream(channelId)
            }
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
        // Resolve via the backend so we know the engine type (hls/mpegts/native)
        // and feed ExoPlayer the correct MIME — assuming HLS for everything breaks
        // the raw-MPEG-TS channels the backend now serves.
        viewModelScope.launch {
            runCatching {
                val info = repository.resolveStream(channelId)
                val mime = when (info.type) {
                    "hls"    -> MimeTypes.APPLICATION_M3U8
                    "mpegts" -> MimeTypes.VIDEO_MP2T
                    else     -> null   // native / unknown → let ExoPlayer infer from the container
                }
                val builder = MediaItem.Builder()
                    .setUri(info.url)
                    .setMediaMetadata(MediaMetadata.Builder().setTitle(channel?.name).build())
                if (mime != null) builder.setMimeType(mime)
                p.setMediaItem(builder.build())
                p.prepare()
                p.playWhenReady = true
                if (channel != null) {
                    repository.pushWatched(channel, _state.value.logoMap[channelId])
                }
                // Keep Cast session in sync with channel changes
                castManager?.setStream(info.url, channel?.name)
            }.onFailure { e ->
                android.util.Log.e("PlayerViewModel", "loadStream failed: ${e.message}")
                // If the controller we used became disconnected, clear it so the next
                // init() call (e.g. from back-stack restore) will reconnect cleanly.
                if (_player.value == p) _player.value = null
            }
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

    // ── Sleep timer ───────────────────────────────────────────────────────────

    fun setSleepTimer(minutes: Int) {
        sleepTimerJob?.cancel()
        val endsAt = System.currentTimeMillis() + minutes * 60_000L
        _state.value = _state.value.copy(sleepTimerEndsAt = endsAt)
        sleepTimerJob = viewModelScope.launch {
            delay(minutes * 60_000L)
            _player.value?.pause()
            _state.value = _state.value.copy(sleepTimerEndsAt = null)
        }
    }

    fun cancelSleepTimer() {
        sleepTimerJob?.cancel()
        sleepTimerJob = null
        _state.value = _state.value.copy(sleepTimerEndsAt = null)
    }

    // ── Stream URL override sheet ─────────────────────────────────────────────

    fun showOverrideSheet(channel: Channel) {
        _state.value = _state.value.copy(overrideSheetChannel = channel)
    }

    fun dismissOverrideSheet() {
        _state.value = _state.value.copy(overrideSheetChannel = null)
    }

    fun saveStreamOverride(channelId: String, url: String?) {
        repository.setStreamOverride(channelId, url)
        _state.value = _state.value.copy(overrideSheetChannel = null)
        // Reload stream with new URL if it's the active channel
        if (channelId == _state.value.activeChannelId) loadStream(channelId)
    }

    fun getStreamOverride(channelId: String): String? = repository.getStreamOverride(channelId)

    fun getDefaultStreamUrl(channelId: String): String = repository.defaultStreamUrl(channelId)

    override fun onCleared() {
        sleepTimerJob?.cancel()
        castManager?.release()
        controllerFuture?.let { MediaController.releaseFuture(it) }
        super.onCleared()
    }
}
