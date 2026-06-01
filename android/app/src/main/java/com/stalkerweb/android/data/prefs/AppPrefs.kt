package com.stalkerweb.android.data.prefs

import android.content.Context
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

    companion object {
        private const val KEY_SERVER_URL    = "server_url"
        private const val KEY_WATCH_HISTORY = "watch_history"
        private const val MAX_HISTORY       = 10
    }
}
