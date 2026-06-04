package com.stalkerweb.android.cast

import android.content.Context
import android.util.Log
import com.google.android.gms.cast.MediaInfo
import com.google.android.gms.cast.MediaLoadRequestData
import com.google.android.gms.cast.MediaMetadata
import com.google.android.gms.cast.framework.CastContext
import com.google.android.gms.cast.framework.CastSession
import com.google.android.gms.cast.framework.SessionManagerListener
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class CastManager(context: Context) {

    private val castContext: CastContext? = runCatching {
        CastContext.getSharedInstance(context)
    }.onFailure {
        Log.w("CastManager", "Cast not available: ${it.message}")
    }.getOrNull()

    private val _isCasting = MutableStateFlow(false)
    val isCasting: StateFlow<Boolean> = _isCasting.asStateFlow()

    // Url + title of the stream that should be loaded when a session connects
    private var pendingStreamUrl: String? = null
    private var pendingTitle: String?     = null

    private val sessionListener = object : SessionManagerListener<CastSession> {
        override fun onSessionStarted(session: CastSession, sessionId: String) {
            _isCasting.value = true
            pendingStreamUrl?.let { loadMediaOnSession(session, it, pendingTitle) }
        }
        override fun onSessionResumed(session: CastSession, wasSuspended: Boolean) {
            _isCasting.value = true
        }
        override fun onSessionEnded(session: CastSession, error: Int) {
            _isCasting.value = false
        }
        override fun onSessionSuspended(session: CastSession, reason: Int) {
            _isCasting.value = false
        }
        override fun onSessionStartFailed(session: CastSession, error: Int)  { _isCasting.value = false }
        override fun onSessionStarting(session: CastSession)                 {}
        override fun onSessionEnding(session: CastSession)                   {}
        override fun onSessionResuming(session: CastSession, sessionId: String) {}
        override fun onSessionResumeFailed(session: CastSession, error: Int) {}
    }

    init {
        castContext?.sessionManager?.addSessionManagerListener(sessionListener, CastSession::class.java)
        _isCasting.value = castContext?.sessionManager?.currentCastSession?.isConnected == true
    }

    /** Call whenever the active channel changes — loads immediately if already casting,
     *  or queues the stream so it loads as soon as a session connects. */
    fun setStream(url: String, title: String?) {
        pendingStreamUrl = url
        pendingTitle     = title
        val session = castContext?.sessionManager?.currentCastSession ?: return
        if (session.isConnected) loadMediaOnSession(session, url, title)
    }

    fun stopCasting() {
        castContext?.sessionManager?.endCurrentSession(true)
    }

    fun release() {
        castContext?.sessionManager?.removeSessionManagerListener(sessionListener, CastSession::class.java)
    }

    private fun loadMediaOnSession(session: CastSession, url: String, title: String?) {
        val meta = MediaMetadata(MediaMetadata.MEDIA_TYPE_GENERIC).apply {
            if (!title.isNullOrBlank()) putString(MediaMetadata.KEY_TITLE, title)
        }
        val mediaInfo = MediaInfo.Builder(url)
            .setStreamType(MediaInfo.STREAM_TYPE_LIVE)
            .setContentType("application/x-mpegurl")
            .setMetadata(meta)
            .build()
        session.remoteMediaClient?.load(
            MediaLoadRequestData.Builder().setMediaInfo(mediaInfo).setAutoplay(true).build()
        )
    }
}
