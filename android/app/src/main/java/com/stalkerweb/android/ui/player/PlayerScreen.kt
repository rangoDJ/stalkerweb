package com.stalkerweb.android.ui.player

import android.app.Activity
import android.content.pm.ActivityInfo
import android.content.res.Configuration
import android.view.WindowManager
import androidx.annotation.OptIn
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.mediarouter.app.MediaRouteButton
import com.google.android.gms.cast.framework.CastButtonFactory
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import coil.compose.AsyncImage
import com.stalkerweb.android.data.api.Channel
import com.stalkerweb.android.ui.utils.rememberIsTV
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit

private const val MAX_STREAM_RETRIES = 2

@OptIn(UnstableApi::class)
@Composable
fun PlayerScreen(
    channelId: String,
    channelName: String,
    viewModel: PlayerViewModel,
    isInPipMode: Boolean = false,
    onSetPipEnabled: (Boolean) -> Unit = {},
    onBack: () -> Unit,
) {
    val context       = LocalContext.current
    val activity      = context as? Activity
    val configuration = LocalConfiguration.current
    val isLandscape   = configuration.orientation == Configuration.ORIENTATION_LANDSCAPE
    val isTV          = rememberIsTV()
    val state         by viewModel.state.collectAsStateWithLifecycle()
    val player        by viewModel.player.collectAsStateWithLifecycle()

    var showControls by remember { mutableStateOf(true) }
    var isPlaying    by remember { mutableStateOf(false) }
    var isBuffering  by remember { mutableStateOf(true) }
    var playerError  by remember { mutableStateOf<String?>(null) }
    var showSleepTimer by remember { mutableStateOf(false) }

    val activeId = state.activeChannelId.ifBlank { channelId }

    // Auto-retry on playback error: Stalker create_link tokens are short-lived, so
    // a stream that errors out (expired token, transient CDN hiccup) usually plays
    // again after re-resolving. Retry a couple of times with a short backoff before
    // surfacing the error. The listener outlives channel switches, so read the live
    // channel id via rememberUpdatedState and reset the budget when it changes.
    val retryScope = rememberCoroutineScope()
    val currentActiveId by rememberUpdatedState(activeId)
    var retryCount by remember { mutableStateOf(0) }
    LaunchedEffect(activeId) { retryCount = 0 }

    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(playing: Boolean) { isPlaying = playing }
            override fun onPlaybackStateChanged(playbackState: Int) {
                isBuffering = playbackState == Player.STATE_BUFFERING ||
                              playbackState == Player.STATE_IDLE
                if (playbackState == Player.STATE_READY) { playerError = null; retryCount = 0 }
            }
            override fun onPlayerError(error: PlaybackException) {
                if (retryCount < MAX_STREAM_RETRIES) {
                    retryCount++
                    isBuffering = true
                    playerError = null
                    retryScope.launch {
                        delay(1500L * retryCount)          // brief, growing backoff
                        viewModel.loadStream(currentActiveId)  // re-resolve (token may have expired)
                    }
                } else {
                    isBuffering = false
                    playerError = error.message ?: "Playback error"
                }
            }
        }
        player?.addListener(listener)
        onDispose { player?.removeListener(listener) }
    }

    DisposableEffect(Unit) {
        viewModel.init(channelId)
        onSetPipEnabled(true)
        onDispose {
            onSetPipEnabled(false)
            activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }
    }

    // Keep the screen awake while video is actually playing so Android's display
    // timeout doesn't sleep the device mid-stream. The flag is cleared on pause and
    // when leaving the player, so normal idle timeout resumes.
    DisposableEffect(activity, isPlaying) {
        val window = activity?.window
        if (isPlaying) window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onDispose { window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }
    }

    LaunchedEffect(activeId) { playerError = null }

    LaunchedEffect(showControls, isPlaying, isLandscape, isTV) {
        if (showControls && isPlaying && (isLandscape || isTV)) {
            delay(3_000)
            showControls = false
        }
    }

    val displayName = state.channels.find { it.uniqueId == activeId }?.name ?: channelName

    // Sleep timer dialog
    if (showSleepTimer) {
        SleepTimerDialog(
            currentEndsAt = state.sleepTimerEndsAt,
            onSet         = { viewModel.setSleepTimer(it) },
            onCancel      = { viewModel.cancelSleepTimer() },
            onDismiss     = { showSleepTimer = false },
        )
    }

    // Stream override sheet
    state.overrideSheetChannel?.let { ch ->
        StreamOverrideSheet(
            channel         = ch,
            currentOverride = viewModel.getStreamOverride(ch.uniqueId),
            defaultUrl      = viewModel.getDefaultStreamUrl(ch.uniqueId),
            onSave          = { url -> viewModel.saveStreamOverride(ch.uniqueId, url) },
            onDismiss       = { viewModel.dismissOverrideSheet() },
        )
    }

    if (isInPipMode) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            ExoPlayerSurface(player = player, modifier = Modifier.fillMaxSize())
        }
        return
    }

    if (isLandscape || isTV) {
        LandscapePlayer(
            player              = player,
            displayName         = displayName,
            isPlaying           = isPlaying,
            isBuffering         = isBuffering,
            playerError         = playerError,
            showControls        = showControls,
            showChannelList     = state.showChannelList,
            channels            = state.channels,
            activeId            = activeId,
            logoMap             = state.logoMap,
            favoriteIds         = state.favoriteIds,
            sleepTimerEndsAt    = state.sleepTimerEndsAt,
            isCasting           = state.isCasting,
            castManager         = viewModel.castManager,
            isTV                = isTV,
            onToggleControls    = { showControls = !showControls },
            onShowControls      = { showControls = true },
            onBack              = onBack,
            onExitFullscreen    = {
                if (!isTV) activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            },
            onToggleChannelList = viewModel::toggleChannelList,
            onSelectChannel     = { viewModel.selectChannel(it.uniqueId) },
            onLongClickChannel  = { viewModel.showOverrideSheet(it) },
            onToggleFavorite    = { viewModel.toggleFavorite(it) },
            onPreviousChannel   = { viewModel.previousChannel() },
            onNextChannel       = { viewModel.nextChannel() },
            onTogglePlayPause   = { if (isPlaying) player?.pause() else player?.play() },
            onRetry             = { viewModel.loadStream(activeId) },
            onSleepTimer        = { showSleepTimer = true },
        )
    } else {
        PortraitPlayer(
            player              = player,
            displayName         = displayName,
            isPlaying           = isPlaying,
            isBuffering         = isBuffering,
            playerError         = playerError,
            showControls        = showControls,
            channels            = state.displayedChannels,
            genres              = state.genres,
            selectedGenre       = state.selectedGenre,
            activeId            = activeId,
            logoMap             = state.logoMap,
            favoriteIds         = state.favoriteIds,
            sleepTimerEndsAt    = state.sleepTimerEndsAt,
            isCasting           = state.isCasting,
            castManager         = viewModel.castManager,
            onToggleControls    = { showControls = !showControls },
            onBack              = onBack,
            onGoFullscreen      = {
                activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            },
            onSelectChannel     = { viewModel.selectChannel(it.uniqueId) },
            onLongClickChannel  = { viewModel.showOverrideSheet(it) },
            onToggleFavorite    = { viewModel.toggleFavorite(it) },
            onSelectGenre       = { viewModel.setGenre(it) },
            onRetry             = { viewModel.loadStream(activeId) },
            onSleepTimer        = { showSleepTimer = true },
        )
    }
}

// ── Landscape / fullscreen layout ─────────────────────────────────────────────

@OptIn(UnstableApi::class)
@Composable
private fun LandscapePlayer(
    player: Player?,
    displayName: String,
    isPlaying: Boolean,
    isBuffering: Boolean,
    playerError: String?,
    showControls: Boolean,
    showChannelList: Boolean,
    channels: List<Channel>,
    activeId: String,
    logoMap: Map<String, String>,
    favoriteIds: Set<String>,
    sleepTimerEndsAt: Long?,
    isCasting: Boolean,
    castManager: com.stalkerweb.android.cast.CastManager?,
    isTV: Boolean = false,
    onToggleControls: () -> Unit,
    onShowControls: () -> Unit,
    onBack: () -> Unit,
    onExitFullscreen: () -> Unit,
    onToggleChannelList: () -> Unit,
    onSelectChannel: (Channel) -> Unit,
    onLongClickChannel: (Channel) -> Unit,
    onToggleFavorite: (Channel) -> Unit,
    onPreviousChannel: () -> Unit = {},
    onNextChannel: () -> Unit = {},
    onTogglePlayPause: () -> Unit = {},
    onRetry: () -> Unit,
    onSleepTimer: () -> Unit,
) {
    val playerFocusRequester = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        try { playerFocusRequester.requestFocus() } catch (_: Exception) {}
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black)
            .focusRequester(playerFocusRequester)
            .focusable()
            .onKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown) return@onKeyEvent false
                onShowControls()
                when (event.key) {
                    Key.DirectionCenter, Key.Enter -> { onTogglePlayPause(); true }
                    Key.MediaPlayPause             -> { onTogglePlayPause(); true }
                    Key.MediaPlay                  -> { player?.play(); true }
                    Key.MediaPause                 -> { player?.pause(); true }
                    Key.DirectionUp                -> { if (!showChannelList) { onPreviousChannel(); true } else false }
                    Key.DirectionDown              -> { if (!showChannelList) { onNextChannel(); true } else false }
                    Key.DirectionRight             -> { onToggleChannelList(); true }
                    Key.DirectionLeft              -> { if (showChannelList) { onToggleChannelList(); true } else false }
                    else                           -> false
                }
            }
            .clickable(
                indication        = null,
                interactionSource = remember { MutableInteractionSource() },
            ) { onToggleControls() }
    ) {
        ExoPlayerSurface(player = player, modifier = Modifier.fillMaxSize())

        PlaybackOverlay(isBuffering = isBuffering, playerError = playerError, onRetry = onRetry)

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
                SleepTimerChip(sleepTimerEndsAt)
                LiveBadge()
                Spacer(Modifier.width(4.dp))
                IconButton(onClick = onSleepTimer) {
                    Icon(Icons.Default.Bedtime, "Sleep timer", tint = if (sleepTimerEndsAt != null) MaterialTheme.colorScheme.primary else Color.White)
                }
                if (!isTV && castManager != null) {
                    CastButton(castManager)
                }
                IconButton(onClick = onToggleChannelList) {
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
                IconButton(onClick = onTogglePlayPause) {
                    Icon(
                        if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                        "Play/Pause", tint = Color.White,
                    )
                }
                Spacer(Modifier.weight(1f))
                if (!isTV) {
                    IconButton(onClick = onExitFullscreen) {
                        Icon(Icons.Default.FullscreenExit, "Exit fullscreen", tint = Color.White)
                    }
                }
            }
        }

        // Channel list panel slides from right
        AnimatedVisibility(
            visible  = showChannelList,
            enter    = slideInHorizontally { it },
            exit     = slideOutHorizontally { it },
            modifier = Modifier.align(Alignment.CenterEnd),
        ) {
            ChannelListPanel(
                channels         = channels,
                activeId         = activeId,
                logoMap          = logoMap,
                favoriteIds      = favoriteIds,
                onSelect         = onSelectChannel,
                onLongClick      = onLongClickChannel,
                onToggleFavorite = onToggleFavorite,
                dark             = true,
            )
        }
    }
}

// ── Portrait / YouTube-style layout ──────────────────────────────────────────

@OptIn(UnstableApi::class)
@Composable
private fun PortraitPlayer(
    player: Player?,
    displayName: String,
    isPlaying: Boolean,
    isBuffering: Boolean,
    playerError: String?,
    showControls: Boolean,
    channels: List<Channel>,
    genres: List<String>,
    selectedGenre: String?,
    activeId: String,
    logoMap: Map<String, String>,
    favoriteIds: Set<String>,
    sleepTimerEndsAt: Long?,
    isCasting: Boolean,
    castManager: com.stalkerweb.android.cast.CastManager?,
    onToggleControls: () -> Unit,
    onBack: () -> Unit,
    onGoFullscreen: () -> Unit,
    onSelectChannel: (Channel) -> Unit,
    onLongClickChannel: (Channel) -> Unit,
    onToggleFavorite: (Channel) -> Unit,
    onSelectGenre: (String?) -> Unit,
    onRetry: () -> Unit,
    onSleepTimer: () -> Unit,
) {
    Column(
        Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .background(MaterialTheme.colorScheme.background)
    ) {
        // 16:9 video box
        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
                .background(Color.Black)
                .clickable(
                    indication        = null,
                    interactionSource = remember { MutableInteractionSource() },
                ) { onToggleControls() }
        ) {
            ExoPlayerSurface(player = player, modifier = Modifier.fillMaxSize())

            PlaybackOverlay(isBuffering = isBuffering, playerError = playerError, onRetry = onRetry)

            if (showControls) {
                Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.35f))) {
                    IconButton(
                        onClick  = onBack,
                        modifier = Modifier.align(Alignment.TopStart).padding(4.dp),
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Color.White)
                    }
                    Row(
                        modifier = Modifier.align(Alignment.TopEnd).padding(4.dp),
                        horizontalArrangement = Arrangement.spacedBy(0.dp),
                    ) {
                        IconButton(onClick = onSleepTimer) {
                            Icon(
                                Icons.Default.Bedtime, "Sleep timer",
                                tint = if (sleepTimerEndsAt != null) MaterialTheme.colorScheme.primary else Color.White,
                            )
                        }
                        if (castManager != null) CastButton(castManager)
                        IconButton(onClick = onGoFullscreen) {
                            Icon(Icons.Default.Fullscreen, "Fullscreen", tint = Color.White)
                        }
                    }
                    IconButton(
                        onClick  = { if (isPlaying) player?.pause() else player?.play() },
                        modifier = Modifier.align(Alignment.Center).size(52.dp),
                    ) {
                        Icon(
                            if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                            "Play/Pause", tint = Color.White, modifier = Modifier.size(40.dp),
                        )
                    }
                }
            }
        }

        // Info strip
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
            SleepTimerChip(sleepTimerEndsAt)
            Spacer(Modifier.width(4.dp))
            LiveBadge()
        }

        HorizontalDivider()

        // Genre filter chips
        if (genres.isNotEmpty()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                genres.forEach { genre ->
                    FilterChip(
                        selected = selectedGenre == genre,
                        onClick  = { onSelectGenre(genre) },
                        label    = { Text(genre, style = MaterialTheme.typography.labelSmall) },
                    )
                }
                FilterChip(
                    selected = selectedGenre == null,
                    onClick  = { onSelectGenre(null) },
                    label    = { Text("All", style = MaterialTheme.typography.labelSmall) },
                )
            }
            HorizontalDivider()
        }

        ChannelListPanel(
            channels         = channels,
            activeId         = activeId,
            logoMap          = logoMap,
            favoriteIds      = favoriteIds,
            onSelect         = onSelectChannel,
            onLongClick      = onLongClickChannel,
            onToggleFavorite = onToggleFavorite,
            dark             = false,
        )
    }
}

// ── Shared small composables ──────────────────────────────────────────────────

@OptIn(UnstableApi::class)
@Composable
private fun ExoPlayerSurface(player: Player?, modifier: Modifier) {
    AndroidView(
        factory = { ctx ->
            PlayerView(ctx).apply {
                this.player = player
                useController = false
                resizeMode    = AspectRatioFrameLayout.RESIZE_MODE_FIT
            }
        },
        update  = { view -> view.player = player },
        modifier = modifier,
    )
}

@Composable
private fun CastButton(castManager: com.stalkerweb.android.cast.CastManager) {
    AndroidView(
        factory = { ctx ->
            // MediaRouteButton's constructor requires a Theme.AppCompat-descendant
            // context; the app's host theme is a framework Material theme, so it
            // throws and would crash the player on open. Guard the whole creation
            // so any Cast/theme failure falls back to an empty view instead of
            // crashing (the cast button simply won't render in that case).
            runCatching {
                MediaRouteButton(ctx).also { btn ->
                    CastButtonFactory.setUpMediaRouteButton(ctx, btn)
                }
            }.getOrElse { android.view.View(ctx) }
        },
        modifier = Modifier
            .size(44.dp)
            .padding(10.dp),
    )
}

@Composable
private fun SleepTimerChip(endsAt: Long?) {
    if (endsAt == null) return
    var remaining by remember { mutableLongStateOf(0L) }
    LaunchedEffect(endsAt) {
        while (true) {
            remaining = ((endsAt - System.currentTimeMillis()) / 1000L).coerceAtLeast(0)
            if (remaining == 0L) break
            delay(1_000)
        }
    }
    val mins = TimeUnit.SECONDS.toMinutes(remaining)
    val secs = remaining % 60
    Surface(
        color  = MaterialTheme.colorScheme.primary.copy(alpha = 0.15f),
        shape  = MaterialTheme.shapes.extraSmall,
    ) {
        Text(
            "%d:%02d".format(mins, secs),
            style    = MaterialTheme.typography.labelSmall,
            color    = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
        )
    }
}

@Composable
private fun PlaybackOverlay(isBuffering: Boolean, playerError: String?, onRetry: () -> Unit) {
    if (isBuffering && playerError == null) {
        Box(Modifier.fillMaxSize()) {
            CircularProgressIndicator(Modifier.align(Alignment.Center), color = Color.White)
        }
    }
    if (playerError != null) {
        Box(Modifier.fillMaxSize()) {
            Column(
                modifier            = Modifier.align(Alignment.Center),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Icon(Icons.Default.ErrorOutline, null, tint = Color.Red, modifier = Modifier.size(36.dp))
                Text(playerError, color = Color.White, style = MaterialTheme.typography.bodySmall)
                Button(onClick = onRetry) { Text("Retry") }
            }
        }
    }
}

@Composable
private fun LiveBadge() {
    Surface(color = MaterialTheme.colorScheme.error, shape = MaterialTheme.shapes.extraSmall) {
        Text(
            "LIVE",
            style    = MaterialTheme.typography.labelSmall,
            color    = Color.White,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
        )
    }
}

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
private fun ChannelListPanel(
    channels: List<Channel>,
    activeId: String,
    logoMap: Map<String, String>,
    favoriteIds: Set<String>,
    onSelect: (Channel) -> Unit,
    onLongClick: (Channel) -> Unit,
    onToggleFavorite: (Channel) -> Unit,
    dark: Boolean,
) {
    val bg       = if (dark) Color.Black.copy(alpha = 0.88f) else Color.Transparent
    val textCol  = if (dark) Color.White.copy(alpha = 0.85f) else MaterialTheme.colorScheme.onSurface
    val mutedCol = if (dark) Color.White.copy(alpha = 0.25f) else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.35f)
    val divCol   = if (dark) Color.White.copy(alpha = 0.05f) else MaterialTheme.colorScheme.outlineVariant

    Surface(
        modifier = if (dark) Modifier.fillMaxHeight().width(230.dp) else Modifier.fillMaxSize(),
        color    = bg,
    ) {
        LazyColumn {
            items(channels, key = { it.uniqueId }) { ch ->
                val isActive = ch.uniqueId == activeId
                val isFav    = ch.uniqueId in favoriteIds
                var focused  by remember { mutableStateOf(false) }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .onFocusChanged { focused = it.isFocused }
                        .border(
                            width = if (focused) 2.dp else 0.dp,
                            color = if (focused) MaterialTheme.colorScheme.primary else Color.Transparent,
                            shape = RoundedCornerShape(4.dp),
                        )
                        .background(
                            if (isActive) MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)
                            else if (focused) MaterialTheme.colorScheme.primary.copy(alpha = 0.10f)
                            else Color.Transparent
                        )
                        .combinedClickable(
                            onClick     = { onSelect(ch) },
                            onLongClick = { onLongClick(ch) },
                        )
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
