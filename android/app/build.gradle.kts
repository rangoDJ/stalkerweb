plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

// Version is injected by CI as -PversionName=X.Y.Z; falls back to default for local builds.
val appVersionName: String = (project.findProperty("versionName") as String?) ?: "0.1.1"
val versionParts = appVersionName.split(".").map { it.toIntOrNull() ?: 0 }
val appVersionCode = (versionParts.getOrElse(0) { 0 } * 10_000) +
                     (versionParts.getOrElse(1) { 0 } * 100) +
                     (versionParts.getOrElse(2) { 0 })

android {
    namespace = "com.stalkerweb.android"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.stalkerweb.android"
        minSdk = 26
        targetSdk = 35
        versionCode = appVersionCode.coerceAtLeast(1)
        versionName = appVersionName

        buildConfigField("String", "GITHUB_REPO", "\"rangoDJ/stalkerweb\"")
    }

    flavorDimensions += "form"

    productFlavors {
        create("mobile") {
            dimension = "form"
            buildConfigField("Boolean", "IS_TV", "false")
        }
        create("tv") {
            dimension = "form"
            applicationIdSuffix = ".tv"
            buildConfigField("Boolean", "IS_TV", "true")
        }
    }

    signingConfigs {
        create("release") {
            storeFile = file(System.getenv("KEYSTORE_PATH") ?: rootProject.file("debug.keystore"))
            storePassword = System.getenv("KEYSTORE_PASSWORD") ?: "android"
            keyAlias = System.getenv("KEY_ALIAS") ?: "androiddebugkey"
            keyPassword = System.getenv("KEY_PASSWORD") ?: "android"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.media3.exoplayer)
    implementation(libs.media3.exoplayer.hls)
    implementation(libs.media3.session)
    implementation(libs.media3.ui)
    implementation(libs.retrofit)
    implementation(libs.retrofit.moshi)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)
    implementation(libs.moshi.kotlin)
    implementation(libs.coil.compose)
    implementation(libs.kotlinx.coroutines.android)

    debugImplementation(libs.androidx.compose.ui.tooling)
}
