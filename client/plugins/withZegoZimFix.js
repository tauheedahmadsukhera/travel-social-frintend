const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withZegoZimFix = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      // 1. Clean up our previous Podfile patches (no longer needed)
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      if (fs.existsSync(podfilePath)) {
        let podfileContent = fs.readFileSync(podfilePath, 'utf-8');
        podfileContent = podfileContent.replace(/# \[ZEGO-FIX[-A-Z0-9]*START\][\s\S]*?# \[ZEGO-FIX[-A-Z0-9]*END\]/g, '');
        // Clean up empty post_install blocks we might have created
        podfileContent = podfileContent.replace(/post_install do \|installer\|\s*end/g, '');
        fs.writeFileSync(podfilePath, podfileContent.trim() + '\n');
      }

      // 2. The real fix: Patch the react-native-zego-zim podspec to explicitly exclude the vendored ZIM.xcframework
      // Because 'ios/**/*.{h,c,m,mm,swift}' globs the headers inside 'ios/libs/ZIM.xcframework', 
      // causing "Multiple commands produce" when Cocoapods also links the actual 'ZIM' pod.
      const modulePath = path.join(config.modRequest.projectRoot, 'node_modules', 'zego-zim-react-native');
      const podspecPath = path.join(modulePath, 'react-native-zego-zim.podspec');
      
      if (fs.existsSync(podspecPath)) {
        let podspecContent = fs.readFileSync(podspecPath, 'utf-8');
        
        // Ensure we only exclude the vendored libs to avoid scooping up the framework headers
        if (podspecContent.includes('s.source_files') && !podspecContent.includes('s.exclude_files')) {
          podspecContent = podspecContent.replace(
            /(s\.source_files\s*=\s*['"]ios\/\*\*\/\*\.\{h,c,m,mm,swift\}['"])/,
            `$1\n  s.exclude_files = 'ios/libs/**/*'`
          );
          fs.writeFileSync(podspecPath, podspecContent);
          console.log('✅ Patched react-native-zego-zim.podspec to exclude bundled libs.');
        } else {
          console.log('⚠️ Podspec already patched or s.source_files not found.');
        }
      } else {
        console.warn('⚠️ zego-zim-react-native podspec not found at', podspecPath);
      }

      return config;
    },
  ]);
};

module.exports = withZegoZimFix;
