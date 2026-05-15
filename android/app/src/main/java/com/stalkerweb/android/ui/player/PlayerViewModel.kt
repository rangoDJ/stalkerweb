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
)

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
                _state.value = _state.value.copy(
                    channels    = channels,
                    logoMap     = logos,
                    favoriteIds = favs,
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

    fun streamUrl(channelId: String): String = repository.streamUrl(channelId)
}
