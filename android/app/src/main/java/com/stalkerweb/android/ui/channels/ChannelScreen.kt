package com.stalkerweb.android.ui.channels

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.stalkerweb.android.data.api.Channel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChannelScreen(
    viewModel: ChannelViewModel,
    onSelectChannel: (Channel) -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            Column {
                TopAppBar(
                    title = {
                        Text(
                            "stalkerweb",
                            color = MaterialTheme.colorScheme.primary,
                        )
                    },
                    actions = {
                        IconButton(onClick = viewModel::load) {
                            Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                        }
                    },
                )
                // Search bar
                OutlinedTextField(
                    value = state.query,
                    onValueChange = viewModel::setQuery,
                    placeholder = { Text("Search channels…") },
                    leadingIcon = {
                        Icon(Icons.Default.Search, null, Modifier.size(18.dp))
                    },
                    trailingIcon = {
                        if (state.query.isNotEmpty()) {
                            IconButton(onClick = { viewModel.setQuery("") }) {
                                Icon(Icons.Default.Close, "Clear", Modifier.size(18.dp))
                            }
                        }
                    },
                    singleLine = true,
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 4.dp),
                )
                // All / Favorites tabs
                val tabTitles = listOf("All", "Favorites")
                TabRow(
                    selectedTabIndex = state.tab.ordinal,
                    indicator = { positions ->
                        TabRowDefaults.PrimaryIndicator(
                            Modifier.tabIndicatorOffset(positions[state.tab.ordinal])
                        )
                    },
                ) {
                    tabTitles.forEachIndexed { index, title ->
                        Tab(
                            selected = state.tab.ordinal == index,
                            onClick  = { viewModel.setTab(ChannelTab.entries[index]) },
                            text     = { Text(title) },
                        )
                    }
                }

                // Genre selection chips
                if (state.tab == ChannelTab.ALL && state.groups.isNotEmpty()) {
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface)
                    ) {
                        item {
                            FilterChip(
                                selected = state.selectedGroupId == null,
                                onClick  = { viewModel.setSelectedGroup(null) },
                                label    = { Text("All") },
                                shape    = RoundedCornerShape(16.dp),
                            )
                        }
                        items(state.groups) { group ->
                            FilterChip(
                                selected = state.selectedGroupId == group.id,
                                onClick  = { viewModel.setSelectedGroup(group.id) },
                                label    = { Text(group.name) },
                                shape    = RoundedCornerShape(16.dp),
                            )
                        }
                    }
                }
            }
        }
    ) { innerPadding ->
        Box(Modifier.fillMaxSize().padding(innerPadding)) {
            when {
                state.loading -> {
                    CircularProgressIndicator(Modifier.align(Alignment.Center))
                }
                state.error != null -> {
                    Column(
                        Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Icon(
                            Icons.Default.Warning, null,
                            Modifier.size(40.dp),
                            tint = MaterialTheme.colorScheme.error,
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            state.error!!,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                        Spacer(Modifier.height(12.dp))
                        Button(onClick = viewModel::load) { Text("Retry") }
                    }
                }
                state.displayed.isEmpty() -> {
                    Column(
                        Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Icon(
                            Icons.Default.Tv, null, Modifier.size(40.dp),
                            tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.3f),
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            if (state.query.isNotEmpty()) "No channels match \"${state.query}\""
                            else "No channels",
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                        )
                    }
                }
                else -> {
                    LazyColumn {
                        items(state.displayed, key = { it.uniqueId }) { channel ->
                            ChannelRow(
                                channel         = channel,
                                logoUrl         = state.logoMap[channel.uniqueId],
                                isFavorite      = channel.uniqueId in state.favoriteIds,
                                onClick         = { onSelectChannel(channel) },
                                onToggleFavorite = { viewModel.toggleFavorite(channel) },
                            )
                            HorizontalDivider(
                                thickness = 0.5.dp,
                                color     = MaterialTheme.colorScheme.outline.copy(alpha = 0.25f),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ChannelRow(
    channel: Channel,
    logoUrl: String?,
    isFavorite: Boolean,
    onClick: () -> Unit,
    onToggleFavorite: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Channel number
        Text(
            text  = channel.number.toString(),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.35f),
            modifier = Modifier.width(28.dp),
        )

        // Logo box
        Box(
            modifier = Modifier
                .size(38.dp)
                .clip(RoundedCornerShape(4.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center,
        ) {
            if (!logoUrl.isNullOrBlank()) {
                AsyncImage(
                    model            = logoUrl,
                    contentDescription = channel.name,
                    contentScale     = ContentScale.Fit,
                    modifier         = Modifier.fillMaxSize().padding(3.dp),
                )
            } else {
                Icon(
                    Icons.Default.Tv, null, Modifier.size(18.dp),
                    tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.25f),
                )
            }
        }

        Spacer(Modifier.width(12.dp))

        // Name
        Text(
            text     = channel.name,
            style    = MaterialTheme.typography.bodyMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )

        // Favorite toggle
        IconButton(onClick = onToggleFavorite, modifier = Modifier.size(36.dp)) {
            Icon(
                imageVector = if (isFavorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                contentDescription = if (isFavorite) "Remove favourite" else "Add favourite",
                tint = if (isFavorite) MaterialTheme.colorScheme.error
                       else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.25f),
                modifier = Modifier.size(18.dp),
            )
        }
    }
}
