const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Expo config plugin to enable cleartext traffic in Android
 * This allows HTTP requests to work in production builds
 */
const withCleartextTraffic = (config) => {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const mainApplication = androidManifest.manifest.application[0];

    // Enable cleartext traffic for HTTP requests (needed for API calls)
    mainApplication.$['android:usesCleartextTraffic'] = 'true';
    
    // Add network security config
    mainApplication.$['android:networkSecurityConfig'] = '@xml/network_security_config';

    return config;
  });
};

module.exports = withCleartextTraffic;
