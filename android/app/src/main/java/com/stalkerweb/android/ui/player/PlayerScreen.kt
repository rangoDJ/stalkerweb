package com.stalkerweb.android.ui.player

import android.app.Activity
import android.content.pm.ActivityInfo
import android.content.res.Configuration
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
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
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
    val context       = LocalContext.current
    val activity      = context as? Activity
    val configuration = LocalConfiguration.current
    val isLandscape   = configuration.orientation == Configuration.ORIENTATION_LANDSCAPE
    val state         by viewModel.state.collectAsStateWithLifecycle()

    var showControls by remember { mutableStateOf(true) }
    var isPlaying    by remember { mutableStateOf(false) }
    var isBuffering  by remember { mutableStateOf(true) }
    var playerError  by remember { mutableStateOf<String?>(null) }

    val activeId = state.activeChannelId.ifBlank { channelId }

    val exoPlayer = remember {
        ExoPlayer.Builder(context).build().apply {
            playWhenReady = true
            addListener(object : Player.Listener {
                override fun onIsPlayingChanged(playing: Boolean) {
                    isPlaying = playing
                }
                override fun onPlaybackStateChanged(playbackState: Int) {
                    isBuffering = playbackState == Player.STATE_BUFFERING ||
                                  playbackState == Player.STATE_IDLE
                    if (playbackState == Player.STATE_READY) playerError = null
                }
                override fun onPlayerError(error: PlaybackException) {
                    isBuffering = false
                    playerError = error.message ?: "Playback error"
                }
            })
        }
    }

    DisposableEffect(Unit) {
        viewModel.init(channelId)
        onDispose {
            activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            exoPlayer.release()
        }
    }

    LaunchedEffect(activeId) {
        playerError = null
        isBuffering = true
        val url = viewModel.streamUrl(activeId)
        val item = MediaItem.Builder()
            .setUri(url)
            .setMimeType(MimeTypes.APPLICATION_M3U8)
            .build()
        exoPlayer.setMediaItem(item)
        exoPlayer.prepare()
    }

    // Auto-hide controls after 3 s when playing (landscape only)
    LaunchedEffect(showControls, isPlaying, isLandscape) {
        if (showControls && isPlaying && isLandscape) {
            delay(3_000)
            showControls = false
        }
    }

    fun goFullscreen() {
        activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
    }

    fun exitFullscreen() {
        activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
    }

    fun loadStream(id: String) {
        playerError = null
        isBuffering = true
        val url  = viewModel.streamUrl(id)
        val item = MediaItem.Builder().setUri(url).setMimeType(MimeTypes.APPLICATION_M3U8).build()
        exoPlayer.setMediaItem(item)
        exoPlayer.prepare()
    }

    // ── Shared video surface ──────────────────────────────────────────────────
    val videoView = @Composable { modifier: Modifier ->
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    player        = exoPlayer
                    useController = false
                    resizeMode    = AspectRatioFrameLayout.RESIZE_MODE_FIT
                }
            },
            modifier = modifier,
        )
    }

    // ── Shared overlay content (spinner + error) ──────────────────────────────
    val overlayContent = @Composable { BoxScope: BoxScope ->
        if (isBuffering && playerError == null) {
            CircularProgressIndicator(
                modifier = Modifier.align(Alignment.Center),
                color    = Color.White,
            )
        }
        if (playerError != null) {
            Column(
                modifier            = Modifier.align(Alignment.Center),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Icon(Icons.Default.ErrorOutline, null, tint = Color.Red, modifier = Modifier.size(36.dp))
                Text(playerError ?: "", color = Color.White, style = MaterialTheme.typography.bodySmall)
                Button(onClick = { loadStream(activeId) }) { Text("Retry") }
            }
        }
    }

    if (isLandscape) {
        // ── LANDSCAPE — fullscreen layout ─────────────────────────────────────
        val displayName = state.channels.find { it.uniqueId == activeId }?.name ?: channelName

        Box(
            Modifier
                .fillMaxSize()
                .background(Color.Black)
                .clickable(
                    indication = null,
                    interactionSource = remember { MutableInteractionSource() },
                ) { showControls = !showControls }
        ) {
            videoView(Modifier.fillMaxSize())
            overlayContent(this)

            // Top bar
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
                    Text(
                        text     = displayName,
                        style    = MaterialTheme.typography.titleMedium,
                        color    = Color.White,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    Surface(color = MaterialTheme.colorScheme.error, shape = MaterialTheme.shapes.extraSmall) {
                        Text("LIVE", style = MaterialTheme.typography.labelSmall, color = Color.White,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
                    }
                    Spacer(Modifier.width(8.dp))
                    IconButton(onClick = viewModel::toggleChannelList) {
                        Icon(Icons.AutoMirrored.Filled.List, "Channel list", tint = Color.White)
                    }
                }
            }

            // Bottom bar
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
                            "Play/Pause", tint = Color.White,
                        )
                    }
                    Spacer(Modifier.weight(1f))
                    IconButton(onClick = { exitFullscreen() }) {
                        Icon(Icons.Default.FullscreenExit, "Exit fullscreen", tint = Color.White)
                    }
                }
            }

            // Channel list panel
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

    } else {
        // ── PORTRAIT — YouTube-style layout ──────────────────────────────────
        val displayName = state.channels.find { it.uniqueId == activeId }?.name ?: channelName

        Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {

            // Video section — 16:9 aspect ratio, full width
            Box(
                Modifier
                    .fillMaxWidth()
                    .aspectRatio(16f / 9f)
                    .background(Color.Black)
                    .clickable(
                        indication = null,
                        interactionSource = remember { MutableInteractionSource() },
                    ) { showControls = !showControls }
            ) {
                videoView(Modifier.fillMaxSize())
                overlayContent(this)

                // Portrait controls overlay
                AnimatedVisibility(
                    visible  = showControls,
                    enter    = fadeIn(),
                    exit     = fadeOut(),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.35f))) {
                        // Back button — top left
                        IconButton(
                            onClick  = onBack,
                            modifier = Modifier.align(Alignment.TopStart).padding(4.dp),
                        ) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Color.White)
                        }
                        // Fullscreen button — top right
                        IconButton(
                            onClick  = { goFullscreen() },
                            modifier = Modifier.align(Alignment.TopEnd).padding(4.dp),
                        ) {
                            Icon(Icons.Default.Fullscreen, "Fullscreen", tint = Color.White)
                        }
                        // Play/Pause — centre
                        IconButton(
                            onClick  = { if (exoPlayer.isPlaying) exoPlayer.pause() else exoPlayer.play() },
                            modifier = Modifier.align(Alignment.Center).size(52.dp),
                        ) {
                            Icon(
                                if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                                "Play/Pause",
                                tint     = Color.White,
                                modifier = Modifier.size(40.dp),
                            )
                        }
                    }
                }
            }

            // Channel info strip
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surface)
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text     = displayName,
                    style    = MaterialTheme.typography.titleSmall,
                    color    = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.width(8.dp))
                Surface(color = MaterialTheme.colorScheme.error, shape = MaterialTheme.shapes.extraSmall) {
                    Text("LIVE", style = MaterialTheme.typography.labelSmall, color = Color.White,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
                }
            }

            HorizontalDivider()

            // Channel list fills the remaining space
            ChannelListPanel(
                channels         = state.channels,
                activeId         = activeId,
                logoMap          = state.logoMap,
                favoriteIds      = state.favoriteIds,
                onSelect         = { viewModel.selectChannel(it.uniqueId) },
                onToggleFavorite = { viewModel.toggleFavorite(it) },
                darkBackground   = false,
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
    darkBackground: Boolean = true,
) {
    val bg      = if (darkBackground) Color.Black.copy(alpha = 0.88f) else Color.Transparent
    val textCol = if (darkBackground) Color.White.copy(alpha = 0.85f) else MaterialTheme.colorScheme.onSurface
    val mutedCol = if (darkBackground) Color.White.copy(alpha = 0.25f) else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.35f)
    val divCol  = if (darkBackground) Color.White.copy(alpha = 0.05f) else MaterialTheme.colorScheme.outlineVariant

    Surface(
        modifier = if (darkBackground) Modifier.fillMaxHeight().width(230.dp)
                   else Modifier.fillMaxSize(),
        color = bg,
    ) {
        LazyColumn {
            items(channels, key = { it.uniqueId }) { ch ->
                val isActive = ch.uniqueId == activeId
                val isFav    = ch.uniqueId in favoriteIds
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            if (isActive) MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)
                            else Color.Transparent
                        )
                        .clickable { onSelect(ch) }
                        .padding(horizontal = 12.dp, vertical = 9.dp),
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
                        Icon(Icons.Default.Tv, null, Modifier.size(24.dp), tint = mutedCol)
                    }
                    Spacer(Modifier.width(10.dp))
                    Text(
                        text     = ch.name,
                        color    = if (isActive) MaterialTheme.colorScheme.primary else textCol,
                        style    = MaterialTheme.typography.bodySmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    IconButton(onClick = { onToggleFavorite(ch) }, modifier = Modifier.size(28.dp)) {
                        Icon(
                            imageVector        = if (isFav) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                            contentDescription = null,
                            tint               = if (isFav) MaterialTheme.colorScheme.error else mutedCol,
                            modifier           = Modifier.size(14.dp),
                        )
                    }
                }
                HorizontalDivider(thickness = 0.5.dp, color = divCol)
            }
        }
    }
}
