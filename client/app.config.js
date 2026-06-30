
const withPodfilePostInstall = require('./plugins/withPodfilePostInstall');
const withSentryGradleFix = require('./plugins/withSentryGradleFix');
const withKotlinVersionFix = require('./plugins/withKotlinVersionFix');
const withAppAuthRedirectScheme = require('./plugins/withAppAuthRedirectScheme');
const withAndroidManifestFix = require('./plugins/withAndroidManifestFix');
const withNetworkSecurityConfig = require('./plugins/withNetworkSecurityConfig');

export default {
  "expo": {
    "name": "Trips",
    "slug": "trave-social",
    "version": "1.1.1",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "scheme": "trave-social",
    "userInterfaceStyle": "light",
    "android": {
      "versionCode": 124,
      "adaptiveIcon": {
        "backgroundColor": "#FFFFFF",
        "foregroundImage": "./assets/images/icon.png",
        "monochromeImage": "./assets/images/icon.png"
      },
      "softwareKeyboardLayoutMode": "resize",
      "package": "com.tauhee56.travesocial",
      "googleServicesFile": "./google-services.json",
      "permissions": [
        "android.permission.CAMERA",
        "android.permission.RECORD_AUDIO",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.POST_NOTIFICATIONS",
        "android.permission.INTERNET",
        "android.permission.WAKE_LOCK"
      ],
      "config": {
        "googleMaps": {
          "apiKey": process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyDKZ-vpdhQYe2gBak9utt0UOjMCy1BMsXQ"
        }
      }
    },
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.tauhee56.travesocial",
      "buildNumber": "6",
      "googleServicesFile": "./GoogleService-Info.plist",
      "config": {
        "googleMapsApiKey": process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyDKZ-vpdhQYe2gBak9utt0UOjMCy1BMsXQ"
      },
      "infoPlist": {
        "ITSAppUsesNonExemptEncryption": false,
        "NSCameraUsageDescription": "Allow Trips to access your camera for capturing and sharing your travel moments. For example, you can take a photo of a landmark to add to your post or start a live broadcast.",
        "NSMicrophoneUsageDescription": "Allow Trips to access your microphone during live streaming so your followers can hear you describe your travel journey.",
        "NSPhotoLibraryUsageDescription": "Allow Trips to access your photo library so you can share your travel experiences by uploading photos and videos to your posts, stories, and profile. For example, you can pick a beautiful landscape photo from your library to share it with your followers.",
        "NSLocationWhenInUseUsageDescription": "Allow Trips to use your location for maps, location tagging, and passport suggestions while you use the app.",
        "NSLocationAlwaysAndWhenInUseUsageDescription": "Allow Trips to use your location while you are using the app for maps, tagging, and passport suggestions.",
        "NSLocationAlwaysUsageDescription": "Trips uses your location only while you are using the app for maps and passport suggestions.",
        "UIBackgroundModes": [
          "remote-notification"
        ]
      },
      "entitlements": {
        "com.apple.developer.applesignin": [
          "Default"
        ]
      }
    },
    "web": {
      "output": "static",
      "favicon": "./assets/images/favicon.png"
    },
    "plugins": [
      "expo-router",
      "expo-apple-authentication",
      [
        "@react-native-google-signin/google-signin",
        {
          "iosUrlScheme": "com.googleusercontent.apps.709095117662-k35juagf7ihkae81tfm9si43jkg7g177"
        }
      ],
      [
        "expo-build-properties",
        {
          "ios": {
            "useFrameworks": "static"
          },
          "android": {
            "manifestPlaceholders": {
              "appAuthRedirectScheme": "trave-social",
              "traveSocialScheme": "trave-social"
            },
            "enableProguardInReleaseBuilds": false,
            "enableShrinkResourcesInReleaseBuilds": false,
            "compileSdkVersion": 35,
            "targetSdkVersion": 35,
            "kotlinVersion": "1.9.24",
            "enableMinifyInReleaseBuilds": false,
            "gradleProperties": {
              "org.gradle.jvmargs": "-Xmx4g -XX:MaxMetaspaceSize=1g",
              "org.gradle.daemon": "false",
              "org.gradle.configureondemand": "false",
              "org.gradle.parallel": "true",
              "android.kotlin.suppressKotlinVersionCompatibilityCheck.1.9.24": "true"
            }
          }
        }
      ],
      [
        "expo-camera",
        {
          "cameraPermission": "Allow Trips to access your camera for capturing and sharing your travel moments. For example, you can take a photo of a landmark to add to your post or start a live broadcast.",
          "microphonePermission": "Allow Trips to access your microphone during live streaming so your followers can hear you describe your travel journey.",
          "recordAudioAndroid": true
        }
      ],
      [
        "expo-image-picker",
        {
          "photosPermission": "Allow Trips to access your photo library so you can share your travel experiences by uploading photos and videos to your posts, stories, and profile. For example, you can pick a beautiful landscape photo from your library to share it with your followers.",
          "cameraPermission": "Allow Trips to access your camera for capturing and sharing your travel moments. For example, you can take a photo of a landmark to add to your post."
        }
      ],
      [
        "expo-location",
        {
          "locationAlwaysAndWhenInUsePermission": "Allow $(PRODUCT_NAME) to use your location while you use the app for maps, tagging, and passport suggestions.",
          "locationAlwaysPermission": "$(PRODUCT_NAME) uses your location only while you are using the app.",
          "locationWhenInUsePermission": "Allow $(PRODUCT_NAME) to use your location for maps, tagging, and passport suggestions while you use the app.",
          "isIosBackgroundLocationEnabled": false,
          "isAndroidBackgroundLocationEnabled": false,
          "isAndroidForegroundServiceEnabled": false
        }
      ],
      [
        "expo-splash-screen",
        {
          "image": "./assets/images/splashscreenlogo.png",
          "resizeMode": "contain",
          "backgroundColor": "#FFFFFF"
        }
      ],
      "react-native-compressor",
      withPodfilePostInstall,
      withSentryGradleFix,
      withKotlinVersionFix,
      withAppAuthRedirectScheme,
      withAndroidManifestFix,
      withNetworkSecurityConfig
    ],
    "experiments": {
      "typedRoutes": true
    },
    "extra": {
      "router": {
        "origin": false
      },
      "costMode": true,
      "analyticsEnabled": true,
      "dailyCounterSampleRate": 0.05,
      "eas": {
        "projectId": "acd24cff-c209-4589-86fa-508a00859191"
      }
    },
    "owner": "tauheeddev56"
  }
}
