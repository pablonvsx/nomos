require('dotenv/config');

const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY ?? '';
const hasGoogleMapsApiKey = googleMapsApiKey.trim().length > 0;
const baseConfig = {
  name: 'Nomos',
  slug: 'nomos',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'nomos',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.pablonvsx.nomos',
    infoPlist: {
      NSCameraUsageDescription:
        'This app needs access to the camera to take photos of plots during field surveys.',
      NSPhotoLibraryUsageDescription:
        'This app needs access to your photos to attach images to plots during field surveys.',
      NSPhotoLibraryAddUsageDescription:
        'This app needs to save photos to your gallery.',
      NSMicrophoneUsageDescription:
        'This app needs access to the microphone to record audio notes during field surveys.',
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#00000000',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    package: 'com.pablonvsx.nomos',
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    permissions: [
      'android.permission.CAMERA',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.RECORD_AUDIO',
    ],
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
        dark: {
          backgroundColor: '#000000',
        },
      },
    ],
    'expo-sqlite',
    'expo-audio',
    'expo-asset',
    [
      'expo-image-picker',
      {
        photosPermission:
          'This app needs access to your photos to attach images to plots during field surveys.',
        cameraPermission:
          'This app needs access to the camera to take photos of plots during field surveys.',
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'This app needs access to your location to show your position on the map and record survey coordinates.',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    router: {},
    googleMapsConfigured: hasGoogleMapsApiKey,
    eas: {
      projectId: '79f4d877-182e-4dc0-ba4d-cfc321735e6f',
    },
  },
};

module.exports = {
  ...baseConfig,
  android: {
    ...baseConfig.android,
    ...(hasGoogleMapsApiKey
      ? {
          config: {
            ...baseConfig.android?.config,
            googleMaps: {
              apiKey: googleMapsApiKey,
            },
          },
        }
      : {}),
  },
  ios: {
    ...baseConfig.ios,
    ...(hasGoogleMapsApiKey
      ? {
          config: {
            ...baseConfig.ios?.config,
            googleMapsApiKey,
          },
        }
      : {}),
  },
};
