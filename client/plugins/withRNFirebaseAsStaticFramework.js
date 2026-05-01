const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withRNFirebaseAsStaticFramework = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      if (!fs.existsSync(podfilePath)) return config;
      
      let podfileContent = fs.readFileSync(podfilePath, 'utf-8');

      // The key fix for RN Firebase + Static Frameworks on Expo
      const staticFlag = `$RNFirebaseAsStaticFramework = true\n`;
      
      // Remove it if it exists to avoid duplicates
      podfileContent = podfileContent.replace(/^\$RNFirebaseAsStaticFramework.*$/gm, '');

      // Inject at the very top
      podfileContent = staticFlag + podfileContent.trim();

      fs.writeFileSync(podfilePath, podfileContent);
      return config;
    },
  ]);
};

module.exports = withRNFirebaseAsStaticFramework;
