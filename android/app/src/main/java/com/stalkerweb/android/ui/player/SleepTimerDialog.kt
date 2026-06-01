package com.stalkerweb.android.ui.player

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

private val PRESETS = listOf(15, 30, 60, 90)

@Composable
fun SleepTimerDialog(
    currentEndsAt: Long?,
    onSet: (minutes: Int) -> Unit,
    onCancel: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Sleep timer") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (currentEndsAt != null) {
                    val remaining = ((currentEndsAt - System.currentTimeMillis()) / 60_000).coerceAtLeast(0)
                    Text(
                        "Active — $remaining min remaining",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Spacer(Modifier.height(4.dp))
                }
                Text("Stop playback after:", style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.height(4.dp))
                PRESETS.chunked(2).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        row.forEach { mins ->
                            OutlinedButton(
                                onClick   = { onSet(mins); onDismiss() },
                                modifier  = Modifier.weight(1f),
                            ) { Text("$mins min") }
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            if (currentEndsAt != null) {
                TextButton(onClick = { onCancel(); onDismiss() }) { Text("Cancel timer") }
            } else {
                TextButton(onClick = onDismiss) { Text("Close") }
            }
        },
    )
}
