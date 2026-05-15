package com.stalkerweb.android.data.update

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import android.util.Log
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
        body.byteStream().use { input ->
            file.outputStream().use { output ->
                val buf = ByteArray(8 * 1024)
                var n: Int
                while (input.read(buf).also { n = it } != -1) {
                    output.write(buf, 0, n)
                    received += n
                    if (total > 0) onProgress(received.toFloat() / total)
                }
            }
        }
        file.setReadable(true, false)
        file
    }

    fun installApk(file: File) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !context.packageManager.canRequestPackageInstalls()
        ) {
            context.startActivity(
                Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:${context.packageName}"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
            return
        }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        context.startActivity(
            Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        )
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
}
