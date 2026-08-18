// Librería Android del plugin. El proyecto `:tauri-android` lo inyecta el
// tooling de Tauri al correr `pnpm tauri android init/dev` en la app.
plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "click.vimo.plugin.securekeys"
    compileSdk = 34

    defaultConfig {
        minSdk = 24
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    kotlinOptions {
        jvmTarget = "1.8"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    compileOnly(project(":tauri-android"))
}
