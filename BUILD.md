# DroidVoice Build Instructions

DroidVoice is a WebRTC-based voice chat app built with React, Vite, and Capacitor.

## Prerequisites
- [Node.js](https://nodejs.org/) (for web development)
- [Android Studio](https://developer.android.com/studio) (for building the APK)
- [Java Development Kit (JDK)](https://adoptium.net/) (required by Gradle)

## Web Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the signaling server & dev environment:
   ```bash
   npm run dev
   ```

## Building the Android APK
Since the AI Studio environment does not have a full Android SDK/Java setup, you must follow these steps on your local machine to generate the `.apk` file:

1. **Build the Web Project**:
   Generate the static files in the `dist` folder:
   ```bash
   npm run build
   ```

2. **Sync with Capacitor**:
   Update the Android project with the latest web assets:
   ```bash
   npx cap sync android
   ```

3. **Build in Android Studio**:
   - Open the `android` folder in Android Studio.
   - Wait for Gradle to finish syncing.
   - Go to **Build** > **Build Bundle(s) / APK(s)** > **Build APK(s)**.
   - Once finished, you will find the APK at:
     `android/app/build/outputs/apk/debug/app-debug.apk`

4. **CLI Build (Optional)**:
   If you have Gradle installed and `ANDROID_HOME` / `JAVA_HOME` set:
   ```bash
   cd android
   ./gradlew assembleDebug
   ```

## Background Voice Support
To ensure voice chat continues while the app is in the background:
1. Ensure you have the `microphone` permission granted.
2. In Android, go to **App Info** > **Battery** > **Unrestricted** (this prevents Android from killing the app process).
3. The app is integrated with Capacitor, which handles the lifecycle, but a "Foreground Service" plugin is recommended for production-grade background stability.

## Signaling Server
By default, the app looks for the signaling server at the URL it was loaded from. You can change this in the app's **Settings** menu.
- **Port**: 3000
- **Protocol**: HTTP/WebSocket
