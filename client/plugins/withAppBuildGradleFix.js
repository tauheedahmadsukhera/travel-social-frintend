const { withAppBuildGradle } = require("expo/config-plugins");

/**
 * Config plugin to fix the "unknown property enableBundleCompression" error in android/app/build.gradle.
 */
const withAppBuildGradleFix = (config) => {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language === "groovy") {
      let content = config.modResults.contents;
      
      // Remove enableBundleCompression from the react {} block
      if (content.includes("enableBundleCompression")) {
        // More robust regex to handle various line endings and potential padding
        content = content.replace(/.*enableBundleCompression.*\r?\n/g, "");
      }
      
      config.modResults.contents = content;
    }
    return config;
  });
};

module.exports = withAppBuildGradleFix;
