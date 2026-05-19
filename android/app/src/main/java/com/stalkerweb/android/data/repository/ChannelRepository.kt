package com.stalkerweb.android.data.repository

import com.stalkerweb.android.data.api.AddFavoriteRequest
import com.stalkerweb.android.data.api.Channel
import com.stalkerweb.android.data.api.Group
import com.stalkerweb.android.data.api.NowNextEntry
import com.stalkerweb.android.data.api.StalkerApi
import com.stalkerweb.android.data.api.StatusResponse
import com.stalkerweb.android.data.prefs.AppPrefs

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

    /** Returns the proxy stream URL for a channel — ExoPlayer plays this directly. */
    fun streamUrl(channelId: String): String {
        val base = prefs.serverUrl?.trimEnd('/') ?: ""
        return "$base/proxy/stream/$channelId"
    }

    suspend fun testConnection(): StatusResponse = requireApi().getStatus()

    suspend fun getChannels(): List<Channel> = requireApi().getChannels().channels

    suspend fun getGroups(): List<Group> =
        runCatching { requireApi().getGroups().groups }.getOrDefault(emptyList())

    suspend fun getLogoMap(): Map<String, String> =
        runCatching { requireApi().getLogoMap() }.getOrDefault(emptyMap())

    suspend fun getFavoriteIds(): Set<String> =
        runCatching { requireApi().getFavorites().channels.map { it.uniqueId }.toSet() }
            .getOrDefault(emptySet())

    suspend fun addFavorite(uniqueId: String) =
        requireApi().addFavorite(AddFavoriteRequest(uniqueId))

    suspend fun removeFavorite(uniqueId: String) =
        requireApi().removeFavorite(uniqueId)

    suspend fun getNowNext(): Map<String, NowNextEntry> =
        runCatching { requireApi().getNowNext() }.getOrDefault(emptyMap())

    private fun requireApi(): StalkerApi =
        api ?: throw IllegalStateException("No server URL configured")
}
