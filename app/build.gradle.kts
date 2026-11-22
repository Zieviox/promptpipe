import java.util.Properties

plugins {
    id("com.android.application")
}

// The release key's file and password, kept outside the project (scripts/keys_make.sh writes them);
// -PreleaseProperties=… for another place.
val releaseProperties = Properties().apply {
    val home = System.getProperty("user.home")
    val path = (findProperty("releaseProperties") as String?) ?: "$home/.promptpipe/release.properties"
    val file = File(path)
    if (file.exists()) file.inputStream().use { load(it) }
}

// The browser engine's version: scripts/build.sh passes the one Gradle has cached, or Mozilla's
// newest release; the fallback here is only for a bare Gradle run.
val geckoviewVersion = (findProperty("geckoviewVersion") as String?) ?: "144.0.20251020130000"

android {
    namespace = "dev.zieviox.promptpipe"
    compileSdk {
        version = release(37) { minorApiLevel = 2 }
    }
    defaultConfig {
        applicationId = "dev.zieviox.promptpipe"
        minSdk = 29
        targetSdk = 35
        // Version codes never go down (B2): -PversionCode=… from the build script.
        versionCode = ((findProperty("versionCode") as String?) ?: "1").toInt()
        versionName = (findProperty("versionName") as String?) ?: "1.0.0"
        ndk { abiFilters += listOf("arm64-v8a") }
    }
    signingConfigs {
        // The release key (S8), from the first remade release on.
        create("release") {
            if (!releaseProperties.isEmpty) {
                storeFile = File(releaseProperties.getProperty("storeFile"))
                storePassword = releaseProperties.getProperty("storePassword")
                keyAlias = releaseProperties.getProperty("keyAlias")
                keyPassword = releaseProperties.getProperty("keyPassword")
            }
        }
        // A fixed debug.keystore next to the project keeps test builds' signature the same.
        getByName("debug") {
            val fixed = rootProject.file("debug.keystore")
            if (fixed.exists()) {
                storeFile = fixed
                storePassword = "android"
                keyAlias = "androiddebugkey"
                keyPassword = "android"
            }
        }
    }
    buildTypes {
        getByName("debug") { signingConfig = signingConfigs.getByName("debug") }
        getByName("release") {
            isMinifyEnabled = false
            if (!releaseProperties.isEmpty) signingConfig = signingConfigs.getByName("release")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    packaging {
        resources.excludes += listOf("META-INF/*", "plugin.properties", "about.html")
        jniLibs.useLegacyPackaging = true
    }
}

dependencies {
    implementation("org.mozilla.geckoview:geckoview:$geckoviewVersion")
    implementation("org.eclipse.jgit:org.eclipse.jgit:5.13.3.202401111512-r")
}

kotlin {
    compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) }
}
