package com.stalkerweb.android.data.prefs

import android.content.Context
import com.stalkerweb.android.data.api.Channel
import org.json.JSONArray
import org.json.JSONObject

data class WatchedChannel(
    val uniqueId: String,
    val name: String,
    val logoUrl: String?,
    val watchedAt: Long,
)

class AppPrefs(context: Context) {
    private val prefs = context.getSharedPreferences("stalkerweb_prefs", Context.MODE_PRIVATE)

    var serverUrl: String?
        get() = prefs.getString(KEY_SERVER_URL, null)
        set(value) = prefs.edit().putString(KEY_SERVER_URL, value).apply()

    fun clear() = prefs.edit().clear().apply()

    // ── Watch history ─────────────────────────────────────────────────────────

    fun pushWatchedChannel(uniqueId: String, name: String, logoUrl: String?) {
        val list = getWatchedChannels().toMutableList()
        list.removeAll { it.uniqueId == uniqueId }
        list.add(0, WatchedChannel(uniqueId, name, logoUrl, System.currentTimeMillis()))
        val trimmed = list.take(MAX_HISTORY)
        val arr = JSONArray()
        trimmed.forEach { ch ->
            arr.put(JSONObject().apply {
                put("uniqueId", ch.uniqueId)
                put("name", ch.name)
                if (ch.logoUrl != null) put("logoUrl", ch.logoUrl)
                put("watchedAt", ch.watchedAt)
            })
        }
        prefs.edit().putString(KEY_WATCH_HISTORY, arr.toString()).apply()
    }

    fun getWatchedChannels(): List<WatchedChannel> {
        val raw = prefs.getString(KEY_WATCH_HISTORY, null) ?: return emptyList()
        return runCatching {
            val arr = JSONArray(raw)
            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                WatchedChannel(
                    uniqueId  = o.getString("uniqueId"),
                    name      = o.getString("name"),
                    logoUrl   = if (o.has("logoUrl")) o.getString("logoUrl") else null,
                    watchedAt = o.getLong("watchedAt"),
                )
            }
        }.getOrDefault(emptyList())
    }

    // ── Channel list + logo cache ─────────────────────────────────────────────
    // Lets the channel/player UI render instantly on cold start (and survive a
    // briefly-unreachable backend) while a fresh copy loads in the background.

    fun cacheChannels(channels: List<Channel>) {
        val arr = JSONArray()
        channels.forEach { ch ->
            arr.put(JSONObject().apply {
                put("uniqueId", ch.uniqueId)
                put("number", ch.number)
                put("name", ch.name)
                if (ch.logo != null) put("logo", ch.logo)
                if (ch.genre != null) put("genre", ch.genre)
                if (ch.genreId != null) put("genreId", ch.genreId)
            })
        }
        prefs.edit().putString(KEY_CHANNEL_CACHE, arr.toString()).apply()
    }

    fun getCachedChannels(): List<Channel> {
        val raw = prefs.getString(KEY_CHANNEL_CACHE, null) ?: return emptyList()
        return runCatching {
            val arr = JSONArray(raw)
            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                Channel(
                    uniqueId = o.getString("uniqueId"),
                    number   = o.optInt("number", 0),
                    name     = o.getString("name"),
                    logo     = if (o.has("logo")) o.getString("logo") else null,
                    genre    = if (o.has("genre")) o.getString("genre") else null,
                    genreId  = if (o.has("genreId")) o.getString("genreId") else null,
                )
            }
        }.getOrDefault(emptyList())
    }

    fun cacheLogoMap(map: Map<String, String>) {
        val obj = JSONObject()
        map.forEach { (k, v) -> obj.put(k, v) }
        prefs.edit().putString(KEY_LOGO_CACHE, obj.toString()).apply()
    }

    fun getCachedLogoMap(): Map<String, String> {
        val raw = prefs.getString(KEY_LOGO_CACHE, null) ?: return emptyMap()
        return runCatching {
            val obj = JSONObject(raw)
            buildMap { obj.keys().forEach { k -> put(k, obj.getString(k)) } }
        }.getOrDefault(emptyMap())
    }

    fun clearChannelCache() {
        prefs.edit().remove(KEY_CHANNEL_CACHE).remove(KEY_LOGO_CACHE).apply()
    }

    // ── Per-channel stream URL overrides ─────────────────────────────────────

    fun getStreamOverride(uniqueId: String): String? =
        prefs.getString("$KEY_OVERRIDE_PREFIX$uniqueId", null)
            ?.takeIf { it.isNotBlank() }

    fun setStreamOverride(uniqueId: String, url: String?) {
        val editor = prefs.edit()
        if (url.isNullOrBlank()) editor.remove("$KEY_OVERRIDE_PREFIX$uniqueId")
        else editor.putString("$KEY_OVERRIDE_PREFIX$uniqueId", url.trim())
        editor.apply()
    }

    companion object {
        private const val KEY_SERVER_URL      = "server_url"
        private const val KEY_WATCH_HISTORY   = "watch_history"
        private const val KEY_OVERRIDE_PREFIX = "stream_override_"
        private const val KEY_CHANNEL_CACHE   = "channel_cache"
        private const val KEY_LOGO_CACHE      = "logo_cache"
        private const val MAX_HISTORY         = 10
    }
}
