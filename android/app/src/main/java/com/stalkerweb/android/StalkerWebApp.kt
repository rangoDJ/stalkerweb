package com.stalkerweb.android

import android.app.Application
import com.stalkerweb.android.crash.CrashReporter

/**
 * Exists so the crash handler is installed before anything else runs — a crash
 * during Activity startup, or on a background thread before any UI exists,
 * would be missed if this were wired up inside MainActivity.
 */
class StalkerWebApp : Application() {
    override fun onCreate() {
        super.onCreate()
        CrashReporter.install(this)
    }
}
