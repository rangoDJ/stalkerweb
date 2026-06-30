package com.stalkerweb.android.data.repository

import com.stalkerweb.android.data.api.AddFavoriteRequest
import com.stalkerweb.android.data.api.Channel
import com.stalkerweb.android.data.api.Group
import com.stalkerweb.android.data.api.NowNextEntry
import com.stalkerweb.android.data.api.PortalActionResponse
import com.stalkerweb.android.data.api.PortalConfigResponse
import com.stalkerweb.android.data.api.PortalConnectRequest
import com.stalkerweb.android.data.api.StalkerApi
import com.stalkerweb.android.data.api.StatusResponse
import com.stalkerweb.android.data.api.VodCategory
import com.stalkerweb.android.data.api.VodEpisode
import com.stalkerweb.android.data.api.VodItemsResponse
import com.stalkerweb.android.data.api.VodSeason
import com.stalkerweb.android.data.prefs.AppPrefs
import com.stalkerweb.android.data.prefs.WatchedChannel

/** A resolved live stream: its absolute URL and the engine hint for the player. */
data class StreamInfo(val url: String, val type: String)

class ChannelRepository(private val prefs: AppPrefs) {

    private var api: StalkerApi? = null

    /** Called once on app start — restores a previously saved URL. */
    fun initFromPrefs() {
        prefs.serverUrl?.let { api = StalkerApi.create(it) }
    }

    /** Persists the URL and rebuilds the Retrofit client. */
    fun setServerUrl(url: String) {
        val normalized = url.trimEnd('/')
        // Drop the cached channel/logo snapshot when pointing at a different
        // server so the old server's channels don't flash before the refresh.
        if (normalized != prefs.serverUrl) prefs.clearChannelCache()
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

    /**
     * Resolves a channel to a playable URL + engine type by asking the backend
     * (`/api/stream/:id`), which runs create_link and classifies the stream
     * (hls/mpegts/native). A per-channel override skips the backend and is typed
     * by its extension. On any failure we fall back to the direct proxy URL
     * assuming HLS, so playback still attempts rather than dead-ending.
     */
    suspend fun resolveStream(channelId: String): StreamInfo {
        val base = prefs.serverUrl?.trimEnd('/') ?: ""
        prefs.getStreamOverride(channelId)?.let { return StreamInfo(it, inferStreamType(it)) }
        return runCatching {
            val resp = requireApi().getStream(channelId)
            val url = if (resp.streamUrl.startsWith("http", ignoreCase = true)) resp.streamUrl
                      else "$base${resp.streamUrl}"
            StreamInfo(url, resp.streamType.ifBlank { "hls" })
        }.getOrElse {
            StreamInfo("$base/proxy/stream/$channelId", "hls")
        }
    }

    /** Best-effort stream-type guess from a URL extension (used for overrides). */
    private fun inferStreamType(url: String): String {
        val path = url.substringBefore('?').substringBefore('#').lowercase()
        return when {
            path.endsWith(".m3u8") || path.endsWith(".m3u")                       -> "hls"
            path.endsWith(".mp4") || path.endsWith(".mkv") ||
                path.endsWith(".webm") || path.endsWith(".mov")                   -> "native"
            path.endsWith(".ts") || path.endsWith(".mpeg") || path.endsWith(".mpg") -> "mpegts"
            else                                                                  -> "hls"
        }
    }

    fun getStreamOverride(channelId: String): String? = prefs.getStreamOverride(channelId)

    fun setStreamOverride(channelId: String, url: String?) = prefs.setStreamOverride(channelId, url)

    suspend fun testConnection(): StatusResponse = requireApi().getStatus()

    /** Tests a candidate server URL without persisting it or touching the live
     *  client — so an abandoned/failed edit never leaves the app pointed at a
     *  broken server. Commit with [setServerUrl] only after this succeeds. */
    suspend fun testServerUrl(url: String): StatusResponse =
        StalkerApi.create(url.trimEnd('/')).getStatus()

    // ── Portal management ─────────────────────────────────────────────────────

    suspend fun connectPortal(portal: String, mac: String, timezone: String = "Europe/London", lang: String = "en"): PortalActionResponse =
        requireApi().connectPortal(PortalConnectRequest(portal, mac, timezone, lang))

    suspend fun disconnectPortal(): PortalActionResponse =
        requireApi().disconnectPortal()

    suspend fun reconnectPortal(): PortalActionResponse =
        requireApi().reconnectPortal()

    suspend fun getPortalConfig(): PortalConfigResponse? =
        runCatching { requireApi().getPortalConfig() }.getOrNull()

    suspend fun getChannels(): List<Channel> =
        requireApi().getChannels().channels.also { prefs.cacheChannels(it) }

    /** Last-known channel list from disk — lets the UI render instantly on cold
     *  start while the network refresh runs in the background. */
    fun getCachedChannels(): List<Channel> = prefs.getCachedChannels()

    /** Last-known logo map from disk (already absolute URLs). */
    fun getCachedLogoMap(): Map<String, String> = prefs.getCachedLogoMap()

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
            }.also { prefs.cacheLogoMap(it) }
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

    suspend fun getVodItems(type: String, category: String, page: Int, search: String): VodItemsResponse {
        val resp = requireApi().getVodItems(type, category, page, search)
        return resp.copy(items = resp.items.map { it.copy(screenshotUrl = absoluteUrl(it.screenshotUrl)) })
    }

    suspend fun getVodSeasons(showId: String): List<VodSeason> =
        runCatching {
            requireApi().getVodSeasons(showId).seasons.map { it.copy(screenshotUrl = absoluteUrl(it.screenshotUrl)) }
        }.getOrDefault(emptyList())

    suspend fun getVodEpisodes(showId: String, seasonId: String): List<VodEpisode> =
        runCatching {
            requireApi().getVodEpisodes(showId, seasonId).episodes.map { it.copy(screenshotUrl = absoluteUrl(it.screenshotUrl)) }
        }.getOrDefault(emptyList())

    /**
     * The backend returns relative image URLs (e.g. "/api/logos/render?url=…"),
     * which resolve against the origin in the same-origin web UI but not for
     * Coil in the app — it needs an absolute URL. Prefix with the server base.
     */
    private fun absoluteUrl(url: String?): String? = when {
        url.isNullOrBlank()                      -> url
        url.startsWith("http", ignoreCase = true) -> url
        else                                     -> "${prefs.serverUrl?.trimEnd('/') ?: ""}$url"
    }

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
