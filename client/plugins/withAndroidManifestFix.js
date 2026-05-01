const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Config plugin to fix AndroidManifest.xml
 * Replaces ${appAuthRedirectScheme} placeholder with actual value
 */
const withAndroidManifestFix = (config) => {
  return withAndroidManifest(config, (config) => {
    const { modResults } = config;
    const mainApplication = modResults.manifest.application[0];

    if (!mainApplication || !mainApplication.activity) {
      console.warn('⚠️ Could not find activity in AndroidManifest.xml');
      return config;
    }

    // Find MainActivity
    const mainActivity = mainApplication.activity.find(
      (activity) => activity.$['android:name'] === '.MainActivity'
    );

    if (!mainActivity || !mainActivity['intent-filter']) {
      console.warn('⚠️ Could not find MainActivity or intent-filter');
      return config;
    }

    // Find the intent-filter with BROWSABLE category
    const browsableFilter = mainActivity['intent-filter'].find((filter) => {
      return filter.category?.some(
        (cat) => cat.$['android:name'] === 'android.intent.category.BROWSABLE'
      );
    });

    if (!browsableFilter || !browsableFilter.data) {
      console.warn('⚠️ Could not find BROWSABLE intent-filter');
      return config;
    }

    // Replace ${appAuthRedirectScheme} with actual value
    let fixed = false;
    browsableFilter.data = browsableFilter.data.map((dataItem) => {
      if (dataItem.$['android:scheme'] === '${appAuthRedirectScheme}') {
        fixed = true;
        return {
          $: {
            'android:scheme': 'trave-social'
          }
        };
      }
      return dataItem;
    });

    if (fixed) {
      console.log('✅ Fixed ${appAuthRedirectScheme} placeholder in AndroidManifest.xml');
    } else {
      // Add trave-social scheme if not exists
      const hasTraveScheme = browsableFilter.data.some(
        (dataItem) => dataItem.$['android:scheme'] === 'trave-social'
      );
      
      if (!hasTraveScheme) {
        browsableFilter.data.unshift({
          $: {
            'android:scheme': 'trave-social'
          }
        });
        console.log('✅ Added trave-social scheme to AndroidManifest.xml');
      }
    }

    return config;
  });
};

module.exports = withAndroidManifestFix;

