const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withPodfilePostInstall = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const filePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(filePath, 'utf-8');

      const targetConfigPatch = `
      # Fix Xcode 16 / Apple Clang 21 consteval check crash in {fmt} by disabling consteval
      installer.pods_project.targets.each do |target|
        target.build_configurations.each do |config|
          if config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'].nil?
            config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = ['$(inherited)', 'FMT_USE_CONSTEVAL=0']
          else
            if config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'].is_a?(Array)
              unless config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'].include?('FMT_USE_CONSTEVAL=0')
                config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] << 'FMT_USE_CONSTEVAL=0'
              end
            else
              unless config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'].include?('FMT_USE_CONSTEVAL=0')
                config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = [config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'], 'FMT_USE_CONSTEVAL=0']
              end
            end
          end
        end
      end
      `;

      // Check if our patch is already in contents
      if (!contents.includes("FMT_USE_CONSTEVAL=0")) {
        const anchor = /post_install do\s*\|\s*(\w+)\s*\|/;
        const match = contents.match(anchor);
        
        if (match) {
          // Case 1: post_install block already exists. Inject our code right after 'post_install do |installer|'
          console.log('[withPodfilePostInstall] Found existing post_install block. Injecting targetConfigPatch...');
          const index = match.index + match[0].length;
          contents = contents.substring(0, index) + "\n" + targetConfigPatch + contents.substring(index);
        } else {
          // Case 2: post_install block does not exist. Append a new post_install block at the end of the Podfile
          console.log('[withPodfilePostInstall] No post_install block found. Appending a new post_install block...');
          contents += `

post_install do |installer|
  react_native_post_install(installer, config[:reactNativePath]) if defined?(react_native_post_install)
  ${targetConfigPatch}
end
`;
        }
        fs.writeFileSync(filePath, contents);
        console.log('[withPodfilePostInstall] Podfile successfully patched.');
      } else {
        console.log('[withPodfilePostInstall] Patch already applied.');
      }

      return config;
    },
  ]);
};

module.exports = withPodfilePostInstall;
