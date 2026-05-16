package com.stalkerweb.android.ui.setup

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.stalkerweb.android.data.repository.ChannelRepository
import kotlinx.coroutines.launch
import java.net.URI

private fun parseUrl(raw: String): Pair<String, String> {
    if (raw.isBlank()) return "http://" to "3000"
    return runCatching {
        val uri = URI(raw)
        val scheme = uri.scheme ?: "http"
        val host   = uri.host   ?: ""
        val port   = if (uri.port > 0) uri.port.toString() else ""
        "$scheme://$host" to port
    }.getOrElse { raw to "" }
}

@Composable
fun SetupScreen(
    repository: ChannelRepository,
    onConnected: () -> Unit,
) {
    val (initHost, initPort) = remember { parseUrl(repository.getServerUrl() ?: "") }
    var host    by remember { mutableStateOf(initHost) }
    var port    by remember { mutableStateOf(initPort) }
    var testing by remember { mutableStateOf(false) }
    var error   by remember { mutableStateOf<String?>(null) }
    val scope   = rememberCoroutineScope()
    val focus   = LocalFocusManager.current
    val hostFocusRequester = remember { FocusRequester() }

    // Auto-focus the host field on load — essential on TV where there's no tap to focus
    LaunchedEffect(Unit) {
        try { hostFocusRequester.requestFocus() } catch (_: Exception) {}
    }

    fun tryConnect() {
        val h = host.trim().trimEnd('/')
        val p = port.trim()
        if (h.isBlank()) return
        val fullUrl = if (p.isNotEmpty()) "$h:$p" else h
        error   = null
        testing = true
        scope.launch {
            runCatching {
                repository.setServerUrl(fullUrl)
                repository.testConnection()
            }.onSuccess { status ->
                testing = false
                if (status.connected) {
                    onConnected()
                } else {
                    error = "Portal not connected — check stalkerweb configuration."
                }
            }.onFailure { e ->
                testing = false
                error = "Cannot reach server: ${e.message}"
            }
        }
    }

    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .padding(32.dp)
                .widthIn(max = 400.dp),
        ) {
            Icon(
                Icons.Default.Tv,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(48.dp),
            )
            Spacer(Modifier.height(16.dp))
            Text(
                "stalkerweb",
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                "Enter your stalkerweb server address",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.55f),
            )
            Spacer(Modifier.height(32.dp))

            OutlinedTextField(
                value = host,
                onValueChange = { host = it; error = null },
                label = { Text("Server address") },
                placeholder = { Text("http://192.168.1.10") },
                singleLine = true,
                isError = error != null,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Uri,
                    imeAction = ImeAction.Next,
                ),
                keyboardActions = KeyboardActions(onNext = { focus.moveFocus(FocusDirection.Down) }),
                modifier = Modifier.fillMaxWidth().focusRequester(hostFocusRequester),
            )

            Spacer(Modifier.height(12.dp))

            OutlinedTextField(
                value = port,
                onValueChange = { port = it.filter(Char::isDigit); error = null },
                label = { Text("Port") },
                placeholder = { Text("3000") },
                singleLine = true,
                isError = error != null,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Number,
                    imeAction = ImeAction.Go,
                ),
                keyboardActions = KeyboardActions(onGo = { tryConnect() }),
                modifier = Modifier.fillMaxWidth(),
            )

            if (error != null) {
                Spacer(Modifier.height(8.dp))
                Text(
                    error!!,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
            }

            Spacer(Modifier.height(16.dp))

            Button(
                onClick = ::tryConnect,
                enabled = !testing && host.isNotBlank(),
                modifier = Modifier.fillMaxWidth().height(48.dp),
            ) {
                if (testing) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                    Spacer(Modifier.width(10.dp))
                    Text("Connecting…")
                } else {
                    Text("Connect")
                }
            }
        }
    }
}
