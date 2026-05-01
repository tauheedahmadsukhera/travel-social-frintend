// Expo config plugin to enable Android Picture-in-Picture
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withAndroidPip(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;

    // Ensure uses-feature for PiP
    manifest.manifest['uses-feature'] = manifest.manifest['uses-feature'] || [];
    const features = Array.isArray(manifest.manifest['uses-feature'])
      ? manifest.manifest['uses-feature']
      : [manifest.manifest['uses-feature']].filter(Boolean);

    const hasPipFeature = features.some((f) => f['$'] && f['$']['android:name'] === 'android.software.picture_in_picture');
    if (!hasPipFeature) {
      features.push({
        $: {
          'android:name': 'android.software.picture_in_picture',
          'android:required': 'false',
        },
      });
    }
    manifest.manifest['uses-feature'] = features;

    // Set supportsPictureInPicture and resizeableActivity on MainActivity
    const app = manifest.manifest.application?.[0];
    if (app && Array.isArray(app.activity)) {
      app.activity.forEach((activity) => {
        const name = activity.$['android:name'] || '';
        if (name.endsWith('.MainActivity')) {
          activity.$['android:supportsPictureInPicture'] = 'true';
          activity.$['android:resizeableActivity'] = 'true';
        }
      });
    }

    return config;
  });
};
