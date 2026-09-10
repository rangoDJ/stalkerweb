package com.stalkerweb.android.ui.crash

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BugReport
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.stalkerweb.android.BuildConfig

/**
 * Shows the stack trace recorded by [com.stalkerweb.android.crash.CrashReporter]
 * during the previous run. Deliberately verbatim and scrollable rather than
 * summarised — the whole point is to get the real frames off the device.
 */
@Composable
fun CrashReportDialog(report: String, onDismiss: () -> Unit) {
    val context = LocalContext.current
    // Compose gives no element initial D-pad focus on its own — without this the
    // dialog is unusable on TV, where there's no touchscreen to tap a button.
    val dismissFocusRequester = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        try { dismissFocusRequester.requestFocus() } catch (_: Exception) {}
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        icon  = { Icon(Icons.Default.BugReport, contentDescription = null) },
        title = { Text("The app crashed last time") },
        text  = {
            Column {
                Text(
                    "Copy or share these details so the crash can be fixed.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                )
                Spacer(Modifier.height(12.dp))
                // Stack frames are long lines; wrapping them shreds readability,
                // so scroll in both directions instead. focusable() is what lets
                // a TV remote scroll this at all — key events only reach a
                // scrollable region on TV once it can take focus.
                SelectionContainer {
                    Text(
                        report,
                        style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 260.dp)
                            .verticalScroll(rememberScrollState())
                            .horizontalScroll(rememberScrollState())
                            .focusable(),
                        softWrap = false,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick  = onDismiss,
                modifier = Modifier.focusRequester(dismissFocusRequester),
            ) { Text("Dismiss") }
        },
        dismissButton = {
            Row {
                TextButton(onClick = { copyToClipboard(context, report) }) { Text("Copy") }
                // ACTION_SEND rarely has a target on a TV, so don't offer a
                // button there that leads to an empty chooser.
                if (!BuildConfig.IS_TV) {
                    TextButton(onClick = { shareReport(context, report) }) { Text("Share") }
                }
            }
        },
    )
}

private fun copyToClipboard(context: Context, report: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
    if (clipboard == null) {
        Toast.makeText(context, "Clipboard unavailable", Toast.LENGTH_SHORT).show()
        return
    }
    clipboard.setPrimaryClip(ClipData.newPlainText("stalkerweb crash report", report))
    Toast.makeText(context, "Crash report copied", Toast.LENGTH_SHORT).show()
}

private fun shareReport(context: Context, report: String) {
    val intent = Intent(Intent.ACTION_SEND)
        .setType("text/plain")
        .putExtra(Intent.EXTRA_SUBJECT, "stalkerweb crash report")
        .putExtra(Intent.EXTRA_TEXT, report)
    runCatching { context.startActivity(Intent.createChooser(intent, "Share crash report")) }
        .onFailure { Toast.makeText(context, "Nothing to share with", Toast.LENGTH_SHORT).show() }
}
