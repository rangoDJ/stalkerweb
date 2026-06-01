package com.stalkerweb.android.ui.channels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.stalkerweb.android.data.api.Channel
import com.stalkerweb.android.data.api.Group
import com.stalkerweb.android.data.api.NowNextEntry
import com.stalkerweb.android.data.prefs.WatchedChannel
import com.stalkerweb.android.data.repository.ChannelRepository
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

enum class ChannelTab { ALL, FAVORITES }

data class ChannelUiState(
    val channels: List<Channel>      = emptyList(),
    val logoMap: Map<String, String> = emptyMap(),
    val favoriteIds: Set<String>     = emptySet(),
    val groups: List<Group>          = emptyList(),
    val nowNext: Map<String, NowNextEntry> = emptyMap(),
    val recentChannels: List<WatchedChannel> = emptyList(),
    val selectedGroupId: String?     = null,
    val query: String                = "",
    val tab: ChannelTab              = ChannelTab.ALL,
    val loading: Boolean             = true,
    val error: String?               = null,
) {
    val displayed: List<Channel>
        get() {
            var base = if (tab == ChannelTab.FAVORITES)
                channels.filter { it.uniqueId in favoriteIds }
            else
                channels

            if (selectedGroupId != null && tab == ChannelTab.ALL) {
                base = base.filter { it.genreId == selectedGroupId }
            }

            return if (query.isBlank()) base
            else base.filter { it.name.contains(query, ignoreCase = true) }
        }

    /** Show recent row only when on the All tab with no search/group filter active. */
    val showRecent: Boolean
        get() = tab == ChannelTab.ALL && query.isBlank() && selectedGroupId == null && recentChannels.isNotEmpty()
}

class ChannelViewModel(private val repository: ChannelRepository) : ViewModel() {

    private val _state = MutableStateFlow(ChannelUiState())
    val state: StateFlow<ChannelUiState> = _state.asStateFlow()

    init {
        if (repository.getServerUrl() != null) load()
    }

    fun load() {
        // Load watch history immediately so it shows before the network call finishes
        _state.value = _state.value.copy(
            loading        = true,
            error          = null,
            recentChannels = repository.getWatched(),
        )
        viewModelScope.launch {
            runCatching {
                val channels = async { repository.getChannels() }
                val logos    = async { repository.getLogoMap() }
                val favs     = async { repository.getFavoriteIds() }
                val groups   = async { repository.getGroups() }
                val data = Triple(channels.await(), logos.await(), favs.await())
                val grps = groups.await()
                data to grps
            }.onSuccess { (triple, groups) ->
                val (channels, logos, favs) = triple
                _state.value = _state.value.copy(
                    channels    = channels,
                    logoMap     = logos,
                    favoriteIds = favs,
                    groups      = groups,
                    loading     = false,
                )
            }.onFailure { e ->
                _state.value = _state.value.copy(loading = false, error = e.message)
            }
        }
        // EPG fetch is best-effort — don't block or fail the channel list
        viewModelScope.launch {
            val nowNext = repository.getNowNext()
            if (nowNext.isNotEmpty()) _state.value = _state.value.copy(nowNext = nowNext)
        }
    }

    /** Re-read history from prefs — called from MainActivity.onResume so the row
     *  stays fresh after the user returns from the player. */
    fun refreshHistory() {
        _state.value = _state.value.copy(recentChannels = repository.getWatched())
    }

    fun setQuery(q: String) { _state.value = _state.value.copy(query = q) }
    fun setTab(tab: ChannelTab) { _state.value = _state.value.copy(tab = tab) }
    fun setSelectedGroup(id: String?) { _state.value = _state.value.copy(selectedGroupId = id) }

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
