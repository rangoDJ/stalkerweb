package com.stalkerweb.android.ui.player

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.stalkerweb.android.data.api.Channel
import com.stalkerweb.android.data.repository.ChannelRepository
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
    val selectedGenre: String?       = null,   // null = All
) {
    val genres: List<String>
        get() = channels.mapNotNull { it.genre }.filter { it.isNotBlank() }.distinct().sorted()

    val displayedChannels: List<Channel>
        get() = if (selectedGenre == null) channels
                else channels.filter { it.genre == selectedGenre }
}

class PlayerViewModel(private val repository: ChannelRepository) : ViewModel() {

    private val _state = MutableStateFlow(PlayerUiState())
    val state: StateFlow<PlayerUiState> = _state.asStateFlow()

    fun init(channelId: String) {
        _state.value = _state.value.copy(activeChannelId = channelId)
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

    fun selectChannel(channelId: String) {
        _state.value = _state.value.copy(
            activeChannelId = channelId,
            showChannelList = false,
        )
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

    fun streamUrl(channelId: String): String = repository.streamUrl(channelId)
}
