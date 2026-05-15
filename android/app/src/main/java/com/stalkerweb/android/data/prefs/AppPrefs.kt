package com.stalkerweb.android.data.prefs

import android.content.Context

class AppPrefs(context: Context) {
    private val prefs = context.getSharedPreferences("stalkerweb_prefs", Context.MODE_PRIVATE)

    var serverUrl: String?
        get() = prefs.getString(KEY_SERVER_URL, null)
        set(value) = prefs.edit().putString(KEY_SERVER_URL, value).apply()

    fun clear() = prefs.edit().clear().apply()

    companion object {
        private const val KEY_SERVER_URL = "server_url"
    }
}
