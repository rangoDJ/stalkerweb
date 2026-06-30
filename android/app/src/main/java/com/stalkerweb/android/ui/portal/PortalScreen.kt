package com.stalkerweb.android.ui.portal

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PortalScreen(
    viewModel: PortalViewModel,
    onBack: () -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val focus = LocalFocusManager.current

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Portal connection") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { innerPadding ->
        Box(
            Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            when {
                state.loading -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                else -> {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .verticalScroll(rememberScrollState())
                            .padding(24.dp)
                            .widthIn(max = 480.dp)
                            .align(Alignment.TopCenter),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        // Status card
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(
                                containerColor = if (state.connected)
                                    MaterialTheme.colorScheme.primaryContainer
                                else
                                    MaterialTheme.colorScheme.surfaceVariant,
                            ),
                        ) {
                            Row(
                                Modifier.padding(16.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                Icon(
                                    imageVector = if (state.connected) Icons.Default.CheckCircle
                                                  else Icons.Default.Warning,
                                    contentDescription = null,
                                    tint = if (state.connected) MaterialTheme.colorScheme.primary
                                           else MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Column {
                                    Text(
                                        if (state.connected) "Connected" else "Disconnected",
                                        style = MaterialTheme.typography.titleSmall,
                                        color = if (state.connected) MaterialTheme.colorScheme.primary
                                                else MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                    if (state.connected && state.portalUrl.isNotBlank()) {
                                        Text(
                                            state.portalUrl,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                            }
                        }

                        // Portal URL field
                        OutlinedTextField(
                            value = state.portalUrl,
                            onValueChange = viewModel::setPortalUrl,
                            label = { Text("Portal URL") },
                            placeholder = { Text("http://portal.example.com") },
                            singleLine = true,
                            enabled = !state.busy,
                            isError = state.error != null,
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Uri,
                                imeAction = ImeAction.Next,
                            ),
                            keyboardActions = KeyboardActions(onNext = { focus.moveFocus(FocusDirection.Down) }),
                            modifier = Modifier.fillMaxWidth(),
                        )

                        // MAC address field
                        OutlinedTextField(
                            value = state.mac,
                            onValueChange = viewModel::setMac,
                            label = { Text("MAC address") },
                            placeholder = { Text("00:1A:79:XX:XX:XX") },
                            singleLine = true,
                            enabled = !state.busy,
                            isError = state.error != null,
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Ascii,
                                imeAction = ImeAction.Go,
                            ),
                            keyboardActions = KeyboardActions(onGo = {
                                focus.clearFocus()
                                if (!state.connected) viewModel.connect()
                            }),
                            modifier = Modifier.fillMaxWidth(),
                        )

                        // Error message
                        if (state.error != null) {
                            Text(
                                state.error!!,
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodySmall,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }

                        // Action buttons
                        if (state.connected) {
                            OutlinedButton(
                                onClick = viewModel::disconnect,
                                enabled = !state.busy,
                                modifier = Modifier.fillMaxWidth().height(48.dp),
                                colors = ButtonDefaults.outlinedButtonColors(
                                    contentColor = MaterialTheme.colorScheme.error,
                                ),
                            ) {
                                if (state.busy) {
                                    CircularProgressIndicator(
                                        Modifier.size(18.dp),
                                        strokeWidth = 2.dp,
                                        color = MaterialTheme.colorScheme.error,
                                    )
                                    Spacer(Modifier.width(8.dp))
                                }
                                Text("Disconnect")
                            }
                        } else {
                            Button(
                                onClick = viewModel::connect,
                                enabled = !state.busy,
                                modifier = Modifier.fillMaxWidth().height(48.dp),
                            ) {
                                if (state.busy) {
                                    CircularProgressIndicator(
                                        Modifier.size(18.dp),
                                        strokeWidth = 2.dp,
                                        color = MaterialTheme.colorScheme.onPrimary,
                                    )
                                    Spacer(Modifier.width(8.dp))
                                }
                                Text("Connect")
                            }

                            if (state.hasSavedConfig) {
                                OutlinedButton(
                                    onClick = viewModel::reconnect,
                                    enabled = !state.busy,
                                    modifier = Modifier.fillMaxWidth().height(48.dp),
                                ) {
                                    Text("Reconnect with saved config")
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
