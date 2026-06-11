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
    object Vod      : Screen("vod")
    object VodPlayer : Screen(
        "vodplayer?videoId={videoId}&cmd={cmd}&series={series}&seasonId={seasonId}&episodeId={episodeId}&title={title}"
    ) {
        fun go(
            videoId: String,
            cmd: String = "",
            series: String = "",
            seasonId: String = "",
            episodeId: String = "",
            title: String = "",
        ): String {
            fun e(s: String) = URLEncoder.encode(s, "UTF-8")
            return "vodplayer?videoId=${e(videoId)}&cmd=${e(cmd)}&series=${e(series)}" +
                "&seasonId=${e(seasonId)}&episodeId=${e(episodeId)}&title=${e(title)}"
        }
    }
}
