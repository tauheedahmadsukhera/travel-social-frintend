const { withMainActivity } = require('expo/config-plugins');

/**
 * Config plugin to ensure Reanimated and GestureHandler are properly initialized
 * This fixes the "Native part of Reanimated doesn't seem to be initialized" error
 */
const withReanimatedFix = (config) => {
  return withMainActivity(config, (config) => {
    const { modResults } = config;
    let mainActivity = modResults.contents;

    // Check if imports already exist
    if (mainActivity.includes('com.swmansion.gesturehandler')) {
      console.log('✅ Reanimated/GestureHandler imports already exist');
      return config;
    }

    // Add imports after expo imports
    const expoImportRegex = /(import expo\.modules\.ReactActivityDelegateWrapper)/;
    
    if (expoImportRegex.test(mainActivity)) {
      mainActivity = mainActivity.replace(
        expoImportRegex,
        `$1\n\n// Import Reanimated and GestureHandler\nimport com.facebook.react.bridge.ReactContext\nimport com.swmansion.gesturehandler.react.RNGestureHandlerEnabledRootView`
      );
      
      modResults.contents = mainActivity;
      console.log('✅ Added Reanimated/GestureHandler imports to MainActivity');
    } else {
      console.warn('⚠️ Could not find expo imports in MainActivity');
    }

    return config;
  });
};

module.exports = withReanimatedFix;

