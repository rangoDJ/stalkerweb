package com.stalkerweb.android

import java.net.URLEncoder

sealed class Screen(val route: String) {
    object Setup    : Screen("setup")
    object Channels : Screen("channels")
    object Player   : Screen("player/{channelId}/{channelName}") {
        fun go(channelId: String, channelName: String): String {
            val encodedName = URLEncoder.encode(channelName, "UTF-8")
            return "player/$channelId/$encodedName"
        }
    }
}
