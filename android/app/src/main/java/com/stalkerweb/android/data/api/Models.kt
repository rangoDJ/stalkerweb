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
