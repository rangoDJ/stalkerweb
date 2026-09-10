# Retrofit
-keepattributes Signature, InnerClasses, EnclosingMethod
-keepattributes RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations
-keepclassmembers,allowshrinking,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}
-dontwarn org.codehaus.mojo.animal_sniffer.IgnoreJRERequirement
-dontwarn javax.annotation.**
-dontwarn kotlin.Unit
-dontwarn retrofit2.KotlinExtensions
-dontwarn retrofit2.KotlinExtensions$*

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**

# Moshi
-keep class com.squareup.moshi.** { *; }
-keepattributes *Annotation*
-keep class **JsonAdapter { *; }
-keep class com.stalkerweb.android.data.api.** { *; }

# Kotlin Coroutines
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
-keepclassmembers class kotlinx.coroutines.** {
    volatile <fields>;
}

# Media3 / ExoPlayer
-dontwarn androidx.media3.**
-keep class androidx.media3.** { *; }

# Coil
-dontwarn coil.**

# Gson / Moshi serialized model classes
-keepclassmembers class com.stalkerweb.android.** {
    <fields>;
}

# Crash reports (see crash/CrashReporter.kt) are read off the device screen, not
# de-obfuscated against a mapping file, so a release trace has to be readable as
# captured: keep line numbers, real source file names, and our own class/method
# names. -keepnames still allows shrinking — only renaming is disabled.
-keepattributes SourceFile,LineNumberTable
-keepnames class com.stalkerweb.android.** { *; }
