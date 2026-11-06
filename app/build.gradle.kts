plugins {
    id("com.android.application")
}

// CI passes the newest GeckoView release; the fallback is only for local builds.
val geckoviewVersion = (findProperty("geckoviewVersion") as String?) ?: "144.0.20251020130000"

android {
    namespace = "dev.zieviox.promptpipe"
    // GeckoView requires API 37.2 or later.
    compileSdk {
        version = release(37) { minorApiLevel = 2 }
    }

    defaultConfig {
        applicationId = "dev.zieviox.promptpipe"
        minSdk = 26
        targetSdk = 35
        versionCode = ((findProperty("versionCode") as String?) ?: "1").toInt()
        // -PversionName=0.6.0 -PversionCode=9 (the code only ever goes up).
        versionName = (findProperty("versionName") as String?) ?: "0.6.0"
        ndk { abiFilters += listOf("arm64-v8a") }
    }

    signingConfigs {
        // A fixed debug.keystore next to the project (not in the public repo) keeps
        // the signature the same, so each new APK installs over the old one.
        // Without it, Gradle's usual debug key is used.
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
        // Compress GeckoView's native libs: halves the APK download.
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
