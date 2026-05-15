package com.stalkerweb.android.ui.channels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.stalkerweb.android.data.api.Channel
import com.stalkerweb.android.data.repository.ChannelRepository
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

enum class ChannelTab { ALL, FAVORITES }

data class ChannelUiState(
    val channels: List<Channel>    = emptyList(),
    val logoMap: Map<String, String> = emptyMap(),
    val favoriteIds: Set<String>   = emptySet(),
    val query: String              = "",
    val tab: ChannelTab            = ChannelTab.ALL,
    val loading: Boolean           = true,
    val error: String?             = null,
) {
    val displayed: List<Channel>
        get() {
            val base = if (tab == ChannelTab.FAVORITES)
                channels.filter { it.uniqueId in favoriteIds }
            else
                channels
            return if (query.isBlank()) base
            else base.filter { it.name.contains(query, ignoreCase = true) }
        }
}

class ChannelViewModel(private val repository: ChannelRepository) : ViewModel() {

    private val _state = MutableStateFlow(ChannelUiState())
    val state: StateFlow<ChannelUiState> = _state.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
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
                    loading     = false,
                )
            }.onFailure { e ->
                _state.value = _state.value.copy(loading = false, error = e.message)
            }
        }
    }

    fun setQuery(q: String) { _state.value = _state.value.copy(query = q) }
    fun setTab(tab: ChannelTab) { _state.value = _state.value.copy(tab = tab) }

    fun toggleFavorite(channel: Channel) {
        val id    = channel.uniqueId
        val isFav = id in _state.value.favoriteIds
        // Optimistic update
        _state.value = _state.value.copy(
            favoriteIds = if (isFav) _state.value.favoriteIds - id
                          else _state.value.favoriteIds + id,
        )
        viewModelScope.launch {
            runCatching {
                if (isFav) repository.removeFavorite(id) else repository.addFavorite(id)
            }.onFailure {
                // Roll back on network failure
                _state.value = _state.value.copy(
                    favoriteIds = if (isFav) _state.value.favoriteIds + id
                                  else _state.value.favoriteIds - id,
                )
            }
        }
    }
}
