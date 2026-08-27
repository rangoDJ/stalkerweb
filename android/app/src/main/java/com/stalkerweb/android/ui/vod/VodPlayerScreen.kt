package com.stalkerweb.android.ui.vod

import android.app.Activity
import android.view.WindowManager
import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import androidx.compose.ui.platform.LocalContext
import com.stalkerweb.android.data.api.VodEpisode

@OptIn(UnstableApi::class)
@Composable
fun VodPlayerScreen(
    videoId: String,
    cmd: String,
    series: String,
    seasonId: String,
    episodeId: String,
    title: String,
    viewModel: VodPlayerViewModel,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val activity = context as? Activity
    val player  by viewModel.player.collectAsStateWithLifecycle()
    val loading by viewModel.loading.collectAsStateWithLifecycle()
    val error   by viewModel.error.collectAsStateWithLifecycle()
    val episodes         by viewModel.episodes.collectAsStateWithLifecycle()
    val currentEpisodeId by viewModel.currentEpisodeId.collectAsStateWithLifecycle()
    val showPicker       by viewModel.showEpisodePicker.collectAsStateWithLifecycle()

    DisposableEffect(Unit) {
        viewModel.init(videoId, cmd, series, seasonId, episodeId, title)
        onDispose { }
    }

    // Keep the screen awake while this fullscreen player is open so the device's
    // display timeout doesn't sleep mid-playback. Cleared when leaving the screen.
    DisposableEffect(activity) {
        activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onDispose { activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }
    }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        if (player != null) {
            AndroidView(
                factory = { ctx ->
                    PlayerView(ctx).apply {
                        useController = true
                        resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                    }
                },
                update = { it.player = player as Player? },
                modifier = Modifier.fillMaxSize(),
            )
        }

        if (loading && error == null) {
            CircularProgressIndicator(Modifier.align(Alignment.Center), color = Color.White)
        }

        error?.let { msg ->
            Column(
                Modifier.align(Alignment.Center).padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Icon(Icons.Default.ErrorOutline, null, tint = Color.Red, modifier = Modifier.size(36.dp))
                Text(msg, color = Color.White, style = MaterialTheme.typography.bodyMedium)
            }
        }

        IconButton(
            onClick = onBack,
            modifier = Modifier.align(Alignment.TopStart).statusBarsPadding().padding(4.dp),
        ) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Color.White)
        }

        if (showPicker) {
            NextEpisodeDialog(
                episodes         = episodes,
                currentEpisodeId = currentEpisodeId,
                onPlay           = viewModel::playEpisode,
                onDismiss        = viewModel::dismissEpisodePicker,
            )
        }
    }
}

/**
 * Shown when an episode plays out to the end: offers the next episode as the
 * default action and the rest of the season as a list, so finishing an episode
 * doesn't dead-end back at the series sheet.
 */
@Composable
private fun NextEpisodeDialog(
    episodes: List<VodEpisode>,
    currentEpisodeId: String,
    onPlay: (VodEpisode) -> Unit,
    onDismiss: () -> Unit,
) {
    val currentIndex = episodes.indexOfFirst { it.episodeId == currentEpisodeId }
    val next = if (currentIndex >= 0) episodes.getOrNull(currentIndex + 1) else null

    // Nothing focuses itself on TV, so a D-pad user would face a dead dialog.
    val confirmFocusRequester = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        try { confirmFocusRequester.requestFocus() } catch (_: Exception) {}
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (next != null) "Episode finished" else "Season finished") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    if (next != null) "Play the next episode, or pick another one."
                    else "That was the last episode in this season.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                HorizontalDivider()
                LazyColumn(Modifier.heightIn(max = 260.dp)) {
                    items(episodes, key = { it.episodeId }) { ep ->
                        val label = ep.name.ifBlank { "Episode ${ep.seriesNumber}" }
                        TextButton(
                            onClick  = { onPlay(ep) },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                text = when {
                                    ep.episodeId == currentEpisodeId -> "$label (just watched)"
                                    ep.episodeId == next?.episodeId  -> "$label (next)"
                                    else                             -> label
                                },
                                modifier  = Modifier.fillMaxWidth(),
                                textAlign = TextAlign.Start,
                                style     = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            if (next != null) {
                Button(
                    onClick  = { onPlay(next) },
                    modifier = Modifier.focusRequester(confirmFocusRequester),
                ) { Text("Play next") }
            } else {
                TextButton(
                    onClick  = onDismiss,
                    modifier = Modifier.focusRequester(confirmFocusRequester),
                ) { Text("Close") }
            }
        },
        dismissButton = {
            if (next != null) TextButton(onClick = onDismiss) { Text("Close") }
        },
    )
}
