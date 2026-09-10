package com.stalkerweb.android.ui.theme

import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

// ── Palette — mirrors the web app's warm amber/orange glass design tokens ──
private val Amber       = Color(0xFFF59E0B)  // --color-primary
private val AmberLight  = Color(0xFFFBBF24)  // --color-primary-light
private val Orange      = Color(0xFFF97316)  // --color-accent
private val OnAmber     = Color(0xFF1A1206)  // dark warm text on amber buttons

private val BgDark      = Color(0xFF0A0807)  // --color-bg
private val Surface     = Color(0xFF16120E)  // --color-surface
private val Surface2    = Color(0xFF221C16)  // --color-surface-2
private val Surface3    = Color(0xFF2F2820)  // --color-surface-3
private val Border      = Color(0xFF342C23)  // --color-border
private val TextPrimary = Color(0xFFFAF7F2)  // --color-text
private val TextMuted   = Color(0xFFA89F92)  // --color-muted
private val Live        = Color(0xFFF43F5E)  // --color-live

private val DarkColors = darkColorScheme(
    primary              = Amber,
    onPrimary            = OnAmber,
    primaryContainer     = Color(0xFF3A2A0E),
    onPrimaryContainer   = AmberLight,
    secondary            = AmberLight,
    onSecondary          = OnAmber,
    tertiary             = Orange,
    onTertiary           = OnAmber,
    background           = BgDark,
    onBackground         = TextPrimary,
    surface              = Surface,
    onSurface            = TextPrimary,
    surfaceVariant       = Surface2,
    onSurfaceVariant     = TextMuted,
    surfaceContainerLowest = BgDark,
    surfaceContainerLow  = Surface,
    surfaceContainer     = Surface2,
    surfaceContainerHigh = Surface3,
    surfaceContainerHighest = Color(0xFF383026),
    outline              = Border,
    outlineVariant       = Color(0xFF2A241D),
    error                = Live,
    onError              = Color.White,
)

/**
 * Warm "cinematic" app backdrop — amber/orange glows fading into warm-black,
 * matching the web app's fixed radial-gradient backdrop. Applied behind screen
 * content as a full-screen Box background (see MainActivity).
 */
fun appBackgroundBrush(): Brush = Brush.linearGradient(
    colors = listOf(
        Color(0xFF140D06),  // warm top
        BgDark,
        Color(0xFF0C0A08),  // warm-black bottom
    ),
    start = Offset(0f, 0f),
    end = Offset(0f, Float.POSITIVE_INFINITY),
)

@Composable
fun StalkerTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColors,
        typography  = StalkerTypography,
    ) {
        // MaterialTheme does not provide LocalContentColor — normally a Surface or
        // Scaffold supplies it from its container colour. This app paints its own
        // gradient backdrop instead and gives Scaffold a transparent container, so
        // contentColorFor() finds no matching role, returns Unspecified, and falls
        // through to LocalContentColor's default of Color.Black. Every Text without
        // an explicit colour then renders black on a near-black background. Provide
        // the theme foreground so unstyled text is legible by default.
        CompositionLocalProvider(LocalContentColor provides TextPrimary, content = content)
    }
}
