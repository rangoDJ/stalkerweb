package com.stalkerweb.android.ui.vod

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.stalkerweb.android.data.api.VodCategory
import com.stalkerweb.android.data.api.VodEpisode
import com.stalkerweb.android.data.api.VodItem
import com.stalkerweb.android.data.api.VodSeason
import com.stalkerweb.android.data.repository.ChannelRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class VodUiState(
    val type: String                       = "vod",   // "vod" (Movies) | "series" (TV Shows)
    val categories: List<VodCategory>      = emptyList(),
    val selectedCategory: VodCategory?     = null,
    val items: List<VodItem>               = emptyList(),
    val query: String                      = "",
    val page: Int                          = 1,
    val totalPages: Int                    = 1,
    val loadingCategories: Boolean         = false,
    val loadingItems: Boolean              = false,
    val error: String?                     = null,
    // Series drill-down sheet
    val seriesItem: VodItem?               = null,
    val seasons: List<VodSeason>?          = null,
    val selectedSeason: VodSeason?         = null,
    val episodes: List<VodEpisode>?        = null,
    val seriesLoading: Boolean             = false,
) {
    val hasMore: Boolean get() = page < totalPages
}

class VodViewModel(private val repository: ChannelRepository) : ViewModel() {

    private val _state = MutableStateFlow(VodUiState())
    val state: StateFlow<VodUiState> = _state.asStateFlow()

    private var searchJob: Job? = null

    fun setType(type: String) {
        if (type == _state.value.type) return
        _state.value = VodUiState(type = type)
        loadCategories()
    }

    fun loadCategories() {
        _state.value = _state.value.copy(loadingCategories = true, error = null)
        viewModelScope.launch {
            runCatching { repository.getVodCategories(_state.value.type) }
                .onSuccess { cats ->
                    _state.value = _state.value.copy(categories = cats, loadingCategories = false)
                    cats.firstOrNull()?.let { selectCategory(it) }
                }
                .onFailure { _state.value = _state.value.copy(loadingCategories = false, error = it.message) }
        }
    }

    fun selectCategory(cat: VodCategory) {
        _state.value = _state.value.copy(
            selectedCategory = cat, items = emptyList(), page = 1, totalPages = 1, query = "",
        )
        loadItems(cat.id, "", 1)
    }

    fun setQuery(q: String) {
        _state.value = _state.value.copy(query = q)
        val cat = _state.value.selectedCategory ?: return
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(400)
            _state.value = _state.value.copy(items = emptyList(), page = 1)
            loadItems(cat.id, q, 1)
        }
    }

    fun loadMore() {
        val s = _state.value
        if (s.loadingItems || !s.hasMore) return
        val cat = s.selectedCategory ?: return
        loadItems(cat.id, s.query, s.page + 1)
    }

    private fun loadItems(categoryId: String, search: String, page: Int) {
        _state.value = _state.value.copy(loadingItems = true, error = null)
        viewModelScope.launch {
            runCatching { repository.getVodItems(_state.value.type, categoryId, page, search) }
                .onSuccess { r ->
                    _state.value = _state.value.copy(
                        items        = if (page == 1) r.items else _state.value.items + r.items,
                        page         = r.page,
                        totalPages   = r.totalPages,
                        loadingItems = false,
                    )
                }
                .onFailure { _state.value = _state.value.copy(loadingItems = false, error = it.message) }
        }
    }

    // ── Series drill-down ─────────────────────────────────────────────────────

    fun openSeries(item: VodItem) {
        _state.value = _state.value.copy(
            seriesItem = item, seasons = null, selectedSeason = null, episodes = null, seriesLoading = true,
        )
        viewModelScope.launch {
            val seasons = repository.getVodSeasons(item.id)
            _state.value = _state.value.copy(seasons = seasons, seriesLoading = false)
        }
    }

    fun openSeason(season: VodSeason) {
        val show = _state.value.seriesItem ?: return
        _state.value = _state.value.copy(selectedSeason = season, episodes = null, seriesLoading = true)
        viewModelScope.launch {
            val eps = repository.getVodEpisodes(show.id, season.id)
            _state.value = _state.value.copy(episodes = eps, seriesLoading = false)
        }
    }

    fun backToSeasons() {
        _state.value = _state.value.copy(selectedSeason = null, episodes = null)
    }

    fun closeSeries() {
        _state.value = _state.value.copy(
            seriesItem = null, seasons = null, selectedSeason = null, episodes = null, seriesLoading = false,
        )
    }
}
