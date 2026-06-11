package com.stalkerweb.android.data.api

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = false)
data class Channel(
    val uniqueId: String,
    val number: Int = 0,
    val name: String,
    val logo: String? = null,
    val genre: String? = null,
    val genreId: String? = null,
)

@JsonClass(generateAdapter = false)
data class ChannelsResponse(
    val channels: List<Channel>,
    val total: Int = 0,
)

@JsonClass(generateAdapter = false)
data class FavoritesResponse(
    val channels: List<Channel>,
    val groups: List<FavoriteGroup> = emptyList(),
)

@JsonClass(generateAdapter = false)
data class FavoriteGroup(
    val id: String,
    val name: String,
    val channels: List<Channel>,
)

@JsonClass(generateAdapter = false)
data class StatusResponse(
    val connected: Boolean,
    val portal: String? = null,
    val mac: String? = null,
)

@JsonClass(generateAdapter = false)
data class AddFavoriteRequest(
    val uniqueId: String,
)

@JsonClass(generateAdapter = false)
data class Group(
    val id: String,
    val name: String,
)

@JsonClass(generateAdapter = false)
data class GroupsResponse(
    val groups: List<Group>,
)

@JsonClass(generateAdapter = false)
data class NowInfo(
    val title: String,
    val startTime: Long,
    val endTime: Long,
)

@JsonClass(generateAdapter = false)
data class NextInfo(
    val title: String,
    val startTime: Long,
)

@JsonClass(generateAdapter = false)
data class NowNextEntry(
    val now: NowInfo,
    val next: NextInfo? = null,
)

// ── Settings ──────────────────────────────────────────────────────────────────

@JsonClass(generateAdapter = false)
data class SettingsResponse(
    @Json(name = "epg_enabled") val epgEnabled: Boolean = true,
    @Json(name = "vod_enabled") val vodEnabled: Boolean = true,
    @Json(name = "show_adult")  val showAdult: Boolean = false,
)

// ── VOD ───────────────────────────────────────────────────────────────────────

@JsonClass(generateAdapter = false)
data class VodCategory(
    val id: String,
    val title: String,
    val alias: String = "",
)

@JsonClass(generateAdapter = false)
data class VodCategoriesResponse(
    val categories: List<VodCategory> = emptyList(),
)

@JsonClass(generateAdapter = false)
data class VodItem(
    val id: String,
    val name: String = "",
    val description: String = "",
    val year: String = "",
    val durationMin: Int = 0,
    val isHD: Boolean = false,
    val isSeries: Boolean = false,
    val screenshotUrl: String? = null,
    val cmd: String = "",
)

@JsonClass(generateAdapter = false)
data class VodItemsResponse(
    val items: List<VodItem> = emptyList(),
    val totalItems: Int = 0,
    val totalPages: Int = 1,
    val page: Int = 1,
)

@JsonClass(generateAdapter = false)
data class VodSeason(
    val id: String,
    val name: String = "",
    val seasonNumber: String = "",
    val screenshotUrl: String? = null,
)

@JsonClass(generateAdapter = false)
data class VodSeasonsResponse(
    val seasons: List<VodSeason> = emptyList(),
)

@JsonClass(generateAdapter = false)
data class VodEpisode(
    val episodeId: String,
    val seriesNumber: String = "",
    val name: String = "",
    val screenshotUrl: String? = null,
)

@JsonClass(generateAdapter = false)
data class VodEpisodesResponse(
    val episodes: List<VodEpisode> = emptyList(),
)

@JsonClass(generateAdapter = false)
data class VodStreamResponse(
    val streamUrl: String,
    val videoId: String = "",
    val isHls: Boolean = true,
)
