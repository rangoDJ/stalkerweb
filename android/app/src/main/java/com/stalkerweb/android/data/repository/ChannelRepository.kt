package com.stalkerweb.android.data.repository

import com.stalkerweb.android.data.api.AddFavoriteRequest
import com.stalkerweb.android.data.api.Channel
import com.stalkerweb.android.data.api.Group
import com.stalkerweb.android.data.api.NowNextEntry
import com.stalkerweb.android.data.api.StalkerApi
import com.stalkerweb.android.data.api.StatusResponse
import com.stalkerweb.android.data.api.VodCategory
import com.stalkerweb.android.data.api.VodEpisode
import com.stalkerweb.android.data.api.VodItemsResponse
import com.stalkerweb.android.data.api.VodSeason
import com.stalkerweb.android.data.prefs.AppPrefs
import com.stalkerweb.android.data.prefs.WatchedChannel

class ChannelRepository(private val prefs: AppPrefs) {

    private var api: StalkerApi? = null

    /** Called once on app start — restores a previously saved URL. */
    fun initFromPrefs() {
        prefs.serverUrl?.let { api = StalkerApi.create(it) }
    }

    /** Persists the URL and rebuilds the Retrofit client. */
    fun setServerUrl(url: String) {
        val normalized = url.trimEnd('/')
        prefs.serverUrl = normalized
        api = StalkerApi.create(normalized)
    }

    fun getServerUrl(): String? = prefs.serverUrl

    /** Returns the stream URL for a channel — override takes priority over the proxy URL. */
    fun streamUrl(channelId: String): String =
        prefs.getStreamOverride(channelId)
            ?: run {
                val base = prefs.serverUrl?.trimEnd('/') ?: ""
                "$base/proxy/stream/$channelId"
            }

    fun defaultStreamUrl(channelId: String): String {
        val base = prefs.serverUrl?.trimEnd('/') ?: ""
        return "$base/proxy/stream/$channelId"
    }

    fun getStreamOverride(channelId: String): String? = prefs.getStreamOverride(channelId)

    fun setStreamOverride(channelId: String, url: String?) = prefs.setStreamOverride(channelId, url)

    suspend fun testConnection(): StatusResponse = requireApi().getStatus()

    suspend fun getChannels(): List<Channel> = requireApi().getChannels().channels

    suspend fun getGroups(): List<Group> =
        runCatching { requireApi().getGroups().groups }.getOrDefault(emptyList())

    // The backend returns relative logo URLs (e.g. "/api/logos/render?url=…"),
    // which work for the same-origin web UI but not for Coil in the app — it
    // needs an absolute URL. Prefix them with the server base.
    suspend fun getLogoMap(): Map<String, String> =
        runCatching {
            val base = prefs.serverUrl?.trimEnd('/') ?: ""
            requireApi().getLogoMap().mapValues { (_, url) ->
                if (url.startsWith("http", ignoreCase = true)) url else "$base$url"
            }
        }.getOrDefault(emptyMap())

    suspend fun getFavoriteIds(): Set<String> =
        runCatching { requireApi().getFavorites().channels.map { it.uniqueId }.toSet() }
            .getOrDefault(emptySet())

    suspend fun addFavorite(uniqueId: String) =
        requireApi().addFavorite(AddFavoriteRequest(uniqueId))

    suspend fun removeFavorite(uniqueId: String) =
        requireApi().removeFavorite(uniqueId)

    suspend fun getNowNext(): Map<String, NowNextEntry> =
        runCatching { requireApi().getNowNext() }.getOrDefault(emptyMap())

    // ── Settings ──────────────────────────────────────────────────────────────

    /** Whether the VOD section should be shown (controlled from the web Profiles page). */
    suspend fun isVodEnabled(): Boolean =
        runCatching { requireApi().getSettings().vodEnabled }.getOrDefault(false)

    // ── VOD ─────────────────────────────────────────────────────────────────────

    suspend fun getVodCategories(type: String): List<VodCategory> =
        runCatching { requireApi().getVodCategories(type).categories }.getOrDefault(emptyList())

    suspend fun getVodItems(type: String, category: String, page: Int, search: String): VodItemsResponse =
        requireApi().getVodItems(type, category, page, search)

    suspend fun getVodSeasons(showId: String): List<VodSeason> =
        runCatching { requireApi().getVodSeasons(showId).seasons }.getOrDefault(emptyList())

    suspend fun getVodEpisodes(showId: String, seasonId: String): List<VodEpisode> =
        runCatching { requireApi().getVodEpisodes(showId, seasonId).episodes }.getOrDefault(emptyList())

    /** Resolves a VOD stream and returns the absolute, playable proxy URL. */
    suspend fun resolveVodStreamUrl(
        videoId: String,
        cmd: String = "",
        series: String = "",
        seasonId: String = "",
        episodeId: String = "",
    ): String {
        val resp = requireApi().getVodStream(videoId, cmd, series, seasonId, episodeId)
        val base = prefs.serverUrl?.trimEnd('/') ?: ""
        return if (resp.streamUrl.startsWith("http", ignoreCase = true)) resp.streamUrl
               else "$base${resp.streamUrl}"
    }

    // ── Watch history ─────────────────────────────────────────────────────────

    fun pushWatched(channel: Channel, logoUrl: String?) =
        prefs.pushWatchedChannel(channel.uniqueId, channel.name, logoUrl)

    fun getWatched(): List<WatchedChannel> = prefs.getWatchedChannels()

    private fun requireApi(): StalkerApi =
        api ?: throw IllegalStateException("No server URL configured")
}
