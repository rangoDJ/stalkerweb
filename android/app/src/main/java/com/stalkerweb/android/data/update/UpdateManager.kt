package com.stalkerweb.android.data.update

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File

data class ReleaseInfo(val tagName: String, val version: String, val apkUrl: String)

class UpdateManager(private val context: Context) {

    private val client = OkHttpClient()

    suspend fun checkForUpdate(): ReleaseInfo? = withContext(Dispatchers.IO) {
        runCatching {
            val req  = Request.Builder()
                .url("https://api.github.com/repos/${com.stalkerweb.android.BuildConfig.GITHUB_REPO}/releases/latest")
                .header("Accept", "application/vnd.github+json")
                .header("User-Agent", "StalkerWeb-Android/${com.stalkerweb.android.BuildConfig.VERSION_NAME}")
                .build()
            val response = client.newCall(req).execute()
            if (!response.isSuccessful) {
                Log.w("UpdateManager", "Check failed: ${response.code} ${response.message}")
                return@withContext null
            }
            val body = response.body?.string() ?: return@withContext null
            val json    = JSONObject(body)
            val tagName = json.getString("tag_name")
            val version = tagName.trimStart('v')
            if (!isNewer(version, com.stalkerweb.android.BuildConfig.VERSION_NAME)) {
                Log.d("UpdateManager", "Current version (${com.stalkerweb.android.BuildConfig.VERSION_NAME}) is up to date with $version")
                return@withContext null
            }
            val assets  = json.getJSONArray("assets")
            for (i in 0 until assets.length()) {
                val asset = assets.getJSONObject(i)
                if (asset.getString("name").endsWith(".apk")) {
                    Log.i("UpdateManager", "New version found: $version")
                    return@withContext ReleaseInfo(tagName, version, asset.getString("browser_download_url"))
                }
            }
            null
        }.onFailure {
            Log.e("UpdateManager", "Update check error: ${it.message}", it)
        }.getOrNull()
    }

    suspend fun downloadApk(url: String, onProgress: (Float) -> Unit): File = withContext(Dispatchers.IO) {
        val req      = Request.Builder()
            .url(url)
            .header("User-Agent", "StalkerWeb-Android/${com.stalkerweb.android.BuildConfig.VERSION_NAME}")
            .build()
        val response = client.newCall(req).execute()
        val body     = response.body ?: throw Exception("Empty response body")
        val total    = body.contentLength()
        val dir      = File(context.externalCacheDir ?: context.cacheDir, "apk_downloads").also { it.mkdirs() }
        val file     = File(dir, "update.apk")
        var received = 0L

        val nm = NotificationManagerCompat.from(context)
        val progressBuilder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("Downloading update…")
            .setOngoing(true)
            .setSilent(true)
            .setProgress(100, 0, total <= 0)

        body.byteStream().use { input ->
            file.outputStream().use { output ->
                val buf = ByteArray(8 * 1024)
                var n: Int
                var lastNotifiedPct = -1
                while (input.read(buf).also { n = it } != -1) {
                    output.write(buf, 0, n)
                    received += n
                    if (total > 0) {
                        val pct = (received * 100 / total).toInt()
                        onProgress(received.toFloat() / total)
                        // Throttle notification updates to every 5 %
                        if (pct >= lastNotifiedPct + 5) {
                            lastNotifiedPct = pct
                            runCatching {
                                nm.notify(NOTIF_PROGRESS, progressBuilder
                                    .setProgress(100, pct, false)
                                    .setContentText("$pct%")
                                    .build())
                            }
                        }
                    }
                }
            }
        }

        // Cancel progress notification and post "ready to install" notification
        nm.cancel(NOTIF_PROGRESS)

        val launchIntent = context.packageManager
            .getLaunchIntentForPackage(context.packageName)
            ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val pi = PendingIntent.getActivity(
            context, 0, launchIntent ?: Intent(),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        runCatching {
            nm.notify(NOTIF_READY, NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_download_done)
                .setContentTitle("Update ready to install")
                .setContentText("Tap to open the app and install")
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build())
        }

        file.setReadable(true, false)
        file
    }

    /** Returns the cached APK file if it already exists on disk (survives process death). */
    fun cachedApk(): File? {
        val dir  = File(context.externalCacheDir ?: context.cacheDir, "apk_downloads")
        val file = File(dir, "update.apk")
        return if (file.exists() && file.length() > 0) file else null
    }

    private fun isNewer(remote: String, current: String): Boolean {
        val r = remote.split(".").map { it.toIntOrNull() ?: 0 }
        val c = current.split(".").map { it.toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(r.size, c.size)) {
            val diff = r.getOrElse(i) { 0 } - c.getOrElse(i) { 0 }
            if (diff != 0) return diff > 0
        }
        return false
    }

    companion object {
        const val CHANNEL_ID     = "stalkerweb_updates"
        const val CHANNEL_NAME   = "App updates"
        private const val NOTIF_PROGRESS = 1001
        private const val NOTIF_READY    = 1002
    }
}
