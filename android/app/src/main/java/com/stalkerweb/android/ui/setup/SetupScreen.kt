package com.stalkerweb.android.ui.setup

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
    // Blank config → empty port (not a forced 3000). A pre-filled port silently
    // breaks reverse-proxied FQDNs like https://iptv.example.com, where the port
    // is implied (443). The Port field's placeholder still hints "3000".
    if (raw.isBlank()) return "http://" to ""
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
    onBack: (() -> Unit)? = null,
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
        var h = host.trim().trimEnd('/')
        val p = port.trim()
        if (h.isBlank()) return
        // Default to http:// when no scheme is given so a bare host still yields a
        // valid base URL (https FQDNs are entered with their scheme).
        if (!h.contains("://")) h = "http://$h"
        // If the address already carries an explicit port, use it as-is and ignore
        // the Port field. Otherwise append the Port field only when one is given; a
        // blank port lets the scheme default apply (80/443) — needed for reverse-
        // proxied FQDNs like https://iptv.example.com with no port.
        val hasExplicitPort = runCatching { URI(h).port > 0 }.getOrDefault(false)
        val fullUrl = when {
            hasExplicitPort -> h
            p.isNotEmpty()  -> "$h:$p"
            else            -> h
        }
        error   = null
        testing = true
        scope.launch {
            runCatching {
                // Test first; only persist the URL once it actually connects so a
                // failed/abandoned edit never leaves the app on a broken server.
                repository.testServerUrl(fullUrl)
            }.onSuccess { status ->
                testing = false
                if (status.connected) {
                    repository.setServerUrl(fullUrl)
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
        // Shown only when reachable from inside the app (editing settings), not on
        // first-run setup where there's nowhere to go back to.
        if (onBack != null) {
            IconButton(
                onClick = onBack,
                modifier = Modifier.align(Alignment.TopStart).padding(8.dp),
            ) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
            }
        }
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
