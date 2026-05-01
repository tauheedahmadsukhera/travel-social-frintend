const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withFirebaseBuildFix = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      if (!fs.existsSync(podfilePath)) return config;
      
      let podfileContent = fs.readFileSync(podfilePath, 'utf-8');

      const firebaseFixMarker = '# [FIREBASE-FIX-START]';
      const firebaseFixEndMarker = '# [FIREBASE-FIX-END]';
      
      const firebaseFixCode = `
    # Fix for React Native Firebase "non-modular header" build errors
    installer.pods_project.targets.each do |target|
      if target.name.start_with?('RNFB') || target.name == 'react-native-google-maps'
        target.build_configurations.each do |config|
          config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
        end
      end
    end
`;

      const firebaseFixBlock = `${firebaseFixMarker}${firebaseFixCode}${firebaseFixEndMarker}`;

      // Remove existing fix block if present
      podfileContent = podfileContent.replace(/# \[FIREBASE-FIX-START\][\s\S]*?# \[FIREBASE-FIX-END\]/g, '');

      if (podfileContent.includes('post_install do |installer|')) {
        podfileContent = podfileContent.replace(
          /post_install do \|installer\|/,
          `post_install do |installer|\n  ${firebaseFixBlock}`
        );
      } else {
        podfileContent += `
post_install do |installer|
  ${firebaseFixBlock}
end
`;
      }

      fs.writeFileSync(podfilePath, podfileContent);
      return config;
    },
  ]);
};

module.exports = withFirebaseBuildFix;
