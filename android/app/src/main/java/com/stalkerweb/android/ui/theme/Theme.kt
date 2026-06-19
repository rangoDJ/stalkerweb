package com.stalkerweb.android.ui.theme

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

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
 * matching the web app's fixed radial-gradient backdrop. Apply behind screen
 * content (e.g. as a full-screen Box background) so translucent glass surfaces
 * have something rich to sit on.
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

/**
 * Frosted-glass-look surface, mirroring the web `.surface-card`: a translucent
 * warm fill, hairline highlight border, and rounded corners. No real backdrop
 * blur (expensive/unsupported broadly on Android) — the translucency over the
 * warm backdrop reads as glass while staying cheap to draw.
 */
fun Modifier.glassSurface(cornerRadius: Int = 18): Modifier = this
    .clip(RoundedCornerShape(cornerRadius.dp))
    .background(Color(0x12FFF8F0))                       // ~7% warm-white fill
    .border(1.dp, Color(0x1FFFFFFF), RoundedCornerShape(cornerRadius.dp))

@Composable
fun StalkerTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColors,
        typography  = StalkerTypography,
        content     = content,
    )
}
