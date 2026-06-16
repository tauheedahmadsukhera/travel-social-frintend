const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withPodfilePostInstall = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const filePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(filePath, 'utf-8');

      // We want to add C++17 build setting for target 'fmt'
      // Inside the existing post_install block, let's inject our code
      const targetConfigPatch = `
      installer.pods_project.targets.each do |target|
        if target.name == 'fmt'
          target.build_configurations.each do |config|
            config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
          end
        end
      end
      `;

      // Let's check if our patch is already in contents. If not, insert it!
      if (!contents.includes("target.name == 'fmt'")) {
        // Find the post_install do |installer| line
        const anchor = /post_install do \|installer\|/;
        const match = contents.match(anchor);
        if (match) {
          const index = match.index + match[0].length;
          contents = contents.substring(0, index) + targetConfigPatch + contents.substring(index);
          fs.writeFileSync(filePath, contents);
          console.log('[withPodfilePostInstall] Successfully patched Podfile post_install hook for fmt target C++17.');
        } else {
          console.warn('[withPodfilePostInstall] Could not find post_install anchor in Podfile!');
        }
      }

      return config;
    },
  ]);
};

module.exports = withPodfilePostInstall;
