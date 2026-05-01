const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withModularHeaders = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      if (!fs.existsSync(podfilePath)) return config;
      
      let podfileContent = fs.readFileSync(podfilePath, 'utf-8');

      // Check if use_modular_headers! is already present
      if (!podfileContent.includes('use_modular_headers!')) {
        // Inject use_modular_headers! right after the platform :ios declaration
        podfileContent = podfileContent.replace(
          /(platform :ios, .*?\n)/,
          `$1  use_modular_headers!\n`
        );
        fs.writeFileSync(podfilePath, podfileContent);
      }

      return config;
    },
  ]);
};

module.exports = withModularHeaders;
