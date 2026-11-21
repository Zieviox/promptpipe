plugins {
    id("com.android.application")
}

// The browser engine's version is pinned (S8); -PgeckoviewVersion=… picks another for a test.
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
        // A release key of its own from the first remade release (S8); until then a fixed
        // debug.keystore next to the project keeps the signature the same between builds.
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
