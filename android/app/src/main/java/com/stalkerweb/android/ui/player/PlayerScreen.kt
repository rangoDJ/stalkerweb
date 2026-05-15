package com.stalkerweb.android.ui.player

import android.app.Activity
import android.content.pm.ActivityInfo
import androidx.annotation.OptIn
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import coil.compose.AsyncImage
import com.stalkerweb.android.data.api.Channel
import kotlinx.coroutines.delay

@OptIn(UnstableApi::class)
@Composable
fun PlayerScreen(
    channelId: String,
    channelName: String,
    viewModel: PlayerViewModel,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val state by viewModel.state.collectAsStateWithLifecycle()

    var showControls by remember { mutableStateOf(true) }
    var isPlaying    by remember { mutableStateOf(false) }

    // Lock to landscape; restore on exit
    DisposableEffect(Unit) {
        val activity = context as? Activity
        activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        viewModel.init(channelId)
        onDispose {
            activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }
    }

    // Auto-hide controls after 3 s when playing
    LaunchedEffect(showControls, isPlaying) {
        if (showControls && isPlaying) {
            delay(3_000)
            showControls = false
        }
    }

    val activeId = state.activeChannelId.ifBlank { channelId }

    val exoPlayer = remember {
        ExoPlayer.Builder(context).build().apply {
            playWhenReady = true
            addListener(object : Player.Listener {
                override fun onIsPlayingChanged(playing: Boolean) { isPlaying = playing }
            })
        }
    }

    // Reload stream when the active channel changes
    LaunchedEffect(activeId) {
        val url = viewModel.streamUrl(activeId)
        exoPlayer.setMediaItem(MediaItem.fromUri(url))
        exoPlayer.prepare()
    }

    DisposableEffect(Unit) { onDispose { exoPlayer.release() } }

    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black)
            .clickable(
                indication = null,
                interactionSource = remember { MutableInteractionSource() },
            ) { showControls = !showControls }
    ) {
        // ── Video surface ─────────────────────────────────────────────────────
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    player             = exoPlayer
                    useController      = false
                    resizeMode         = AspectRatioFrameLayout.RESIZE_MODE_FIT
                }
            },
            modifier = Modifier.fillMaxSize(),
        )

        // ── Top bar (back + title + channel list toggle) ──────────────────────
        AnimatedVisibility(
            visible  = showControls,
            enter    = fadeIn() + slideInVertically { -it },
            exit     = fadeOut() + slideOutVertically { -it },
            modifier = Modifier.align(Alignment.TopStart),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.Black.copy(alpha = 0.55f))
                    .statusBarsPadding()
                    .padding(horizontal = 4.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Color.White)
                }
                val displayName = state.channels.find { it.uniqueId == activeId }?.name ?: channelName
                Text(
                    text     = displayName,
                    style    = MaterialTheme.typography.titleMedium,
                    color    = Color.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Surface(
                    color  = MaterialTheme.colorScheme.error,
                    shape  = MaterialTheme.shapes.extraSmall,
                ) {
                    Text(
                        "LIVE",
                        style    = MaterialTheme.typography.labelSmall,
                        color    = Color.White,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                    )
                }
                Spacer(Modifier.width(8.dp))
                IconButton(onClick = viewModel::toggleChannelList) {
                    Icon(Icons.AutoMirrored.Filled.List, "Channel list", tint = Color.White)
                }
            }
        }

        // ── Bottom controls ───────────────────────────────────────────────────
        AnimatedVisibility(
            visible  = showControls,
            enter    = fadeIn() + slideInVertically { it },
            exit     = fadeOut() + slideOutVertically { it },
            modifier = Modifier.align(Alignment.BottomStart),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.Black.copy(alpha = 0.55f))
                    .navigationBarsPadding()
                    .padding(horizontal = 8.dp, vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = {
                    if (exoPlayer.isPlaying) exoPlayer.pause() else exoPlayer.play()
                }) {
                    Icon(
                        if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                        "Play/Pause",
                        tint = Color.White,
                    )
                }
            }
        }

        // ── Channel list panel (slides in from the right) ─────────────────────
        AnimatedVisibility(
            visible  = state.showChannelList,
            enter    = slideInHorizontally { it },
            exit     = slideOutHorizontally { it },
            modifier = Modifier.align(Alignment.CenterEnd),
        ) {
            ChannelListPanel(
                channels         = state.channels,
                activeId         = activeId,
                logoMap          = state.logoMap,
                favoriteIds      = state.favoriteIds,
                onSelect         = { viewModel.selectChannel(it.uniqueId) },
                onToggleFavorite = { viewModel.toggleFavorite(it) },
            )
        }
    }
}

@Composable
private fun ChannelListPanel(
    channels: List<Channel>,
    activeId: String,
    logoMap: Map<String, String>,
    favoriteIds: Set<String>,
    onSelect: (Channel) -> Unit,
    onToggleFavorite: (Channel) -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxHeight().width(230.dp),
        color    = Color.Black.copy(alpha = 0.88f),
    ) {
        LazyColumn {
            items(channels, key = { it.uniqueId }) { ch ->
                val isActive = ch.uniqueId == activeId
                val isFav    = ch.uniqueId in favoriteIds
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            if (isActive) MaterialTheme.colorScheme.primary.copy(alpha = 0.25f)
                            else Color.Transparent
                        )
                        .clickable { onSelect(ch) }
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    val logoUrl = logoMap[ch.uniqueId]
                    if (!logoUrl.isNullOrBlank()) {
                        AsyncImage(
                            model              = logoUrl,
                            contentDescription = ch.name,
                            contentScale       = ContentScale.Fit,
                            modifier           = Modifier.size(24.dp),
                        )
                    } else {
                        Icon(
                            Icons.Default.Tv, null, Modifier.size(24.dp),
                            tint = Color.White.copy(alpha = 0.25f),
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text     = ch.name,
                        color    = if (isActive) MaterialTheme.colorScheme.primary
                                   else Color.White.copy(alpha = 0.85f),
                        style    = MaterialTheme.typography.bodySmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    IconButton(onClick = { onToggleFavorite(ch) }, modifier = Modifier.size(28.dp)) {
                        Icon(
                            imageVector = if (isFav) Icons.Default.Favorite
                                          else Icons.Default.FavoriteBorder,
                            contentDescription = null,
                            tint     = if (isFav) MaterialTheme.colorScheme.error
                                       else Color.White.copy(alpha = 0.25f),
                            modifier = Modifier.size(14.dp),
                        )
                    }
                }
                HorizontalDivider(thickness = 0.5.dp, color = Color.White.copy(alpha = 0.05f))
            }
        }
    }
}
