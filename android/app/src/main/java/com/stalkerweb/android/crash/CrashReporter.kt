package com.stalkerweb.android.crash

import android.content.Context
import android.os.Build
import android.util.Log
import com.stalkerweb.android.BuildConfig
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Records uncaught exceptions to the app's private storage so the next launch
 * can show the stack trace on screen.
 *
 * The usual answer — `adb logcat` — isn't practical for the TV build, where the
 * device is across the room with no cable attached, so a crash that only
 * reproduces against a real backend was effectively undiagnosable. This makes
 * the trace readable off the same screen the crash happened on.
 *
 * The report is written and then handed to the platform's default handler, so
 * the process still dies exactly as it did before: this observes crashes, it
 * does not swallow them.
 */
object CrashReporter {

    private const val TAG       = "CrashReporter"
    private const val FILE_NAME = "last_crash.txt"

    // A runaway trace (deep recursion, a cause chain in a loop) would otherwise
    // fill the disk and make the dialog useless — the head is the useful part.
    private const val MAX_CHARS = 64_000

    fun install(context: Context) {
        val appContext = context.applicationContext
        val previous   = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            // Reporting must never turn one crash into a different, more
            // confusing crash — swallow anything that goes wrong writing it.
            runCatching { write(appContext, thread, throwable) }
                .onFailure { Log.e(TAG, "failed to record crash", it) }
            previous?.uncaughtException(thread, throwable)
        }
    }

    /** The report from the previous run, or null if it exited cleanly. */
    fun pendingReport(context: Context): String? = runCatching {
        val f = file(context)
        if (f.exists()) f.readText().takeIf { it.isNotBlank() } else null
    }.getOrNull()

    /** Called once the user has dismissed the report so it isn't shown again. */
    fun clear(context: Context) {
        runCatching { file(context).delete() }
    }

    private fun file(context: Context) = File(context.applicationContext.filesDir, FILE_NAME)

    private fun write(context: Context, thread: Thread, throwable: Throwable) {
        // printStackTrace walks the whole `cause` chain, which is what actually
        // matters here: the useful frame is usually several causes down.
        val stack     = StringWriter().also { throwable.printStackTrace(PrintWriter(it)) }.toString()
        val flavor    = if (BuildConfig.IS_TV) "tv" else "mobile"
        val timestamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date())

        val report = buildString {
            appendLine("stalkerweb ${BuildConfig.VERSION_NAME} ($flavor, build ${BuildConfig.VERSION_CODE})")
            appendLine("time:    $timestamp")
            appendLine("device:  ${Build.MANUFACTURER} ${Build.MODEL}")
            appendLine("android: ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
            appendLine("thread:  ${thread.name}")
            appendLine()
            append(stack)
        }.take(MAX_CHARS)

        file(context).writeText(report)
    }
}
