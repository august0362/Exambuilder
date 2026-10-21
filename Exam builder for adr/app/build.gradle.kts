import java.io.FileInputStream
import java.util.Properties
import java.security.MessageDigest
import groovy.json.JsonSlurper

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
}

// Khoa ky release doc tu keystore.properties (khong commit - xem .gitignore).
// Khong co file -> build release van chay nhung ra APK chua ky (khong cai duoc).
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) FileInputStream(keystorePropsFile).use { load(it) }
}
val hasReleaseSigning = keystorePropsFile.exists()
val updateRepository = providers.gradleProperty("updateRepository").getOrElse("august0362/Exambuilder")
require(Regex("[A-Za-z0-9-]+/[A-Za-z0-9_.-]+").matches(updateRepository)) {
    "updateRepository phai co dang owner/repository"
}
val sharedLibrary = JsonSlurper().parse(rootProject.file("../resources/shared-library.json")) as Map<*, *>
val sharedGistId = sharedLibrary["gist_id"] as String
val sharedGistOwner = sharedLibrary["owner"] as String
require(Regex("[a-fA-F0-9]{32}").matches(sharedGistId) && Regex("[A-Za-z0-9-]+").matches(sharedGistOwner)) {
    "Cau hinh kho de chung khong hop le"
}

android {
    namespace = "com.exambuilder.android"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.exambuilder.android"
        // API 26 (Android 8.0) covers the vast majority of active devices
        // while still allowing java.time / adaptive-icon APIs used here.
        minSdk = 26
        targetSdk = 36
        versionCode = 4
        versionName = "1.3.0"
        buildConfigField("String", "UPDATE_REPOSITORY", "\"$updateRepository\"")
        buildConfigField("String", "SHARED_GIST_ID", "\"$sharedGistId\"")
        buildConfigField("String", "SHARED_GIST_OWNER", "\"$sharedGistOwner\"")
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
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
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.14"
    }

    packaging {
        resources.excludes.add("/META-INF/{AL2.0,LGPL2.1}")
    }

    // Ten file APK xuat ra: release -> ExamBuilder.apk, debug -> ExamBuilder-debug.apk
    // (khong con phai copy tay thanh exam_builder.apk nhu truoc).
    applicationVariants.all {
        val variant = this
        outputs.all {
            val output = this as com.android.build.gradle.internal.api.BaseVariantOutputImpl
            output.outputFileName =
                if (variant.buildType.name == "release") "ExamBuilder.apk"
                else "ExamBuilder-${variant.buildType.name}.apk"
        }
    }
}

// Tai kem file nay va ExamBuilder.apk len CUNG mot GitHub Release cong khai.
tasks.register("prepareAndroidUpdate") {
    dependsOn("assembleRelease")
    doLast {
        check(hasReleaseSigning) { "Can keystore.properties de tao ban cap nhat APK da ky." }
        val apk = layout.buildDirectory.file("outputs/apk/release/ExamBuilder.apk").get().asFile
        val sha256 = MessageDigest.getInstance("SHA-256")
        apk.inputStream().use { input ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                sha256.update(buffer, 0, count)
            }
        }
        val hash = sha256.digest().joinToString("") { "%02x".format(it) }
        val manifest = apk.resolveSibling("android-update.json")
        manifest.writeText("""
            {
              "versionCode": ${android.defaultConfig.versionCode},
              "versionName": "${android.defaultConfig.versionName}",
              "minSdk": ${android.defaultConfig.minSdk},
              "apkName": "ExamBuilder.apk",
              "sha256": "$hash"
            }
        """.trimIndent() + "\n")
        logger.lifecycle("Android update: ${manifest.absolutePath}")
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.4")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.4")
    implementation("androidx.activity:activity-compose:1.9.1")

    // Kho de (persistence JSON) + dong bo GitHub Gist
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")
    implementation("androidx.datastore:datastore-preferences:1.1.1")

    // Render LaTeX that (phan so, can, he phuong trinh \begin{cases}, ma tran...)
    // -> Drawable. Port JLaTeXMath cua noties, font di kem trong AAR, tu init
    // qua ContentProvider. Xem com.exambuilder.android.math.
    implementation("ru.noties:jlatexmath-android:0.2.0")

    val composeBom = platform("androidx.compose:compose-bom:2024.06.00")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3:1.2.1")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.navigation:navigation-compose:2.7.7")
    implementation("androidx.window:window:1.3.0") // responsive layout / window size class

    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
