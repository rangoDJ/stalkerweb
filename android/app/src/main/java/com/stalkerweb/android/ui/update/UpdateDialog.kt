package com.stalkerweb.android.ui.update

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun UpdateDialog(viewModel: UpdateViewModel) {
    val state by viewModel.state.collectAsState()

    when (val s = state) {
        is UpdateState.Available -> AlertDialog(
            onDismissRequest = { viewModel.dismiss() },
            title = { Text("Update available") },
            text  = { Text("Version ${s.release.version} is available. Download and install it now?") },
            confirmButton = {
                Button(onClick = { viewModel.download(s.release) }) { Text("Download") }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.dismiss() }) { Text("Skip") }
            },
        )

        is UpdateState.Downloading -> AlertDialog(
            onDismissRequest = {},
            title = { Text("Downloading…") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    LinearProgressIndicator(
                        progress = { s.progress },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Text(
                        "${(s.progress * 100).toInt()}%",
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.align(Alignment.End),
                    )
                }
            },
            confirmButton = {},
        )

        is UpdateState.ReadyToInstall -> AlertDialog(
            onDismissRequest = { viewModel.dismiss() },
            title = { Text("Ready to install") },
            text  = { Text("Download complete. Tap Install to apply the update.") },
            confirmButton = {
                Button(onClick = { viewModel.install(s.file) }) { Text("Install") }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.dismiss() }) { Text("Later") }
            },
        )

        else -> Unit
    }
}
