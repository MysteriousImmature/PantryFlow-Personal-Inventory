The correct approach is to build a **release APK**. Release builds are non-debuggable by default, but you can declare it explicitly in [app/build.gradle.kts](sandbox:/workspace/scratch/7e62bc47e254/PantryPilot/app/build.gradle.kts):

```kotlin
android {
    buildTypes {
        release {
            isDebuggable = false
            isMinifyEnabled = true
            isShrinkResources = true

            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
}
```

Do not set `android:debuggable` directly in `AndroidManifest.xml`; Gradle build types should control it.

## How the existing APK was compiled

The APK I provided is a debug APK. The build environment used:

|Component|Version|
|---|--:|
|JDK|17|
|Gradle|9.4.1|
|Android Gradle Plugin|9.2.1|
|Kotlin|2.3.10|
|Android compile/target SDK|37|
|Android Build Tools|36.0.0|
|Room|2.8.4|
|Hilt|2.60.1|

The equivalent build command was:

```bash
cd PantryPilot
./gradlew clean assembleDebug
```

Gradle produced:

```text
app/build/outputs/apk/debug/app-debug.apk
```

I copied that APK to:

```text
PantryPilot-v1.0.0-debug.apk
```

During compilation:

1. AAPT2 compiled the manifest, resources, themes, and icons.
    
2. KSP generated Room database and Hilt dependency-injection code.
    
3. Kotlin and the Compose compiler compiled the application.
    
4. D8 converted JVM bytecode into Android DEX files.
    
5. Gradle packaged the DEX, resources, assets, and dependencies into an APK.
    
6. Android automatically signed it with a standard debug certificate.
    
7. I checked ZIP integrity, alignment, APK signature, compiled manifest, permissions, dependencies, native libraries, and suspicious strings.
    

Because `assembleDebug` was used, the result has:

- `android:debuggable="true"`
    
- Android’s debug signing certificate
    
- Compose debug tooling
    
- No suitability for Play Store or production distribution
    

## Recommended method: signed release through Android Studio

This is the simplest production method.

1. Open the `PantryPilot` directory in Android Studio.
    
2. Wait for Gradle synchronization to finish.
    
3. Select **Build → Generate Signed App Bundle or APK**.
    
4. Select **APK** and press **Next**.
    
5. Select the `app` module.
    
6. Press **Create new** under the keystore field.
    
7. Choose a safe location such as:
    

```text
Documents/AndroidKeys/pantrypilot-release.jks
```

8. Enter:
    
    - A strong keystore password
        
    - Alias such as `pantrypilot`
        
    - A strong key password
        
    - Validity of at least 25 years
        
    - Your certificate identity details
        
9. Select the `release` build variant.
    
10. Enable APK Signature Scheme V2 and V3 when offered.
    
11. Press **Create** or **Finish**.
    

The result will normally be under:

```text
app/build/outputs/apk/release/app-release.apk
```

Keep the `.jks` file and its passwords safe. Android updates must be signed with the same signing identity. Losing the signing key may prevent you from updating installed copies of the application.

## Command-line signed release method

### 1. Create a release keystore

Run this once:

```bash
keytool -genkeypair \
  -v \
  -keystore pantrypilot-release.jks \
  -alias pantrypilot \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000
```

`keytool` will ask for passwords and certificate details. Do not commit the `.jks` file or passwords to Git.

### 2. Build an unsigned release APK

```bash
./gradlew clean assembleRelease
```

Without a Gradle signing configuration, the output will normally be:

```text
app/build/outputs/apk/release/app-release-unsigned.apk
```

This build is already non-debuggable, minified, and resource-shrunk, but it cannot be installed until it is signed.

### 3. Align the APK

On Linux or macOS:

```bash
"$ANDROID_SDK_ROOT/build-tools/36.0.0/zipalign" \
  -p -f 4 \
  app/build/outputs/apk/release/app-release-unsigned.apk \
  app/build/outputs/apk/release/PantryPilot-release-aligned.apk
```

### 4. Sign the aligned APK

```bash
"$ANDROID_SDK_ROOT/build-tools/36.0.0/apksigner" sign \
  --ks pantrypilot-release.jks \
  --ks-key-alias pantrypilot \
  --out app/build/outputs/apk/release/PantryPilot-release.apk \
  app/build/outputs/apk/release/PantryPilot-release-aligned.apk
```

Omitting password arguments makes `apksigner` request them interactively, keeping them out of shell history.

### 5. Verify the result

```bash
"$ANDROID_SDK_ROOT/build-tools/36.0.0/apksigner" \
  verify --verbose --print-certs \
  app/build/outputs/apk/release/PantryPilot-release.apk
```

Verify APK alignment:

```bash
"$ANDROID_SDK_ROOT/build-tools/36.0.0/zipalign" \
  -c -v 4 \
  app/build/outputs/apk/release/PantryPilot-release.apk
```

Install it on a connected Android device:

```bash
adb install app/build/outputs/apk/release/PantryPilot-release.apk
```

## Play Store method: Android App Bundle

For Google Play, generate an AAB instead of distributing the APK:

```bash
./gradlew clean bundleRelease
```

Output:

```text
app/build/outputs/bundle/release/app-release.aab
```

An AAB is not installed directly. Google Play uses it to generate optimized APKs for each device. The Android Studio signing wizard can create a signed AAB by selecting **Android App Bundle** instead of **APK**.

## Confirming that it is non-debuggable

Inspect the compiled release manifest:

```bash
apkanalyzer manifest print \
  app/build/outputs/apk/release/PantryPilot-release.apk
```

The application must either show:

```xml
android:debuggable="false"
```

or omit the attribute entirely, which means false for a release build.

You can also check an installed copy:

```bash
adb shell run-as com.example.pantrypilot pwd
```

For a correctly non-debuggable release, Android should respond that the package is not debuggable.