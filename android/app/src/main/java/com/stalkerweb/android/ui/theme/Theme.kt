package com.stalkerweb.android.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Mirrors the web app CSS variables
private val Primary      = Color(0xFF6366F1)  // --color-primary
private val PrimaryLight = Color(0xFFA5B4FC)  // --color-primary-light
private val BgDark       = Color(0xFF0F0F13)  // --color-bg
private val Surface      = Color(0xFF16161D)  // --color-surface
private val Surface2     = Color(0xFF1E1E28)  // --color-surface-2
private val Border       = Color(0xFF2A2A3A)  // --color-border
private val TextPrimary  = Color(0xFFE2E4ED)  // --color-text
private val Live         = Color(0xFFEF4444)  // --color-live

private val DarkColors = darkColorScheme(
    primary          = Primary,
    onPrimary        = Color.White,
    primaryContainer = Primary.copy(alpha = 0.2f),
    secondary        = PrimaryLight,
    background       = BgDark,
    surface          = Surface,
    surfaceVariant   = Surface2,
    onBackground     = TextPrimary,
    onSurface        = TextPrimary,
    outline          = Border,
    error            = Live,
)

@Composable
fun StalkerWebTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColors,
        content = content,
    )
}
