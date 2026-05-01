const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');
const path = require('path');
const fs = require('fs');

/**
 * Expo config plugin to add network security configuration XML
 */
const withNetworkSecurityConfig = (config) => {
  return withAndroidManifest(config, (config) => {
    // Create res/xml directory if it doesn't exist
    const projectRoot = config.modRequest.projectRoot;
    const xmlDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'xml');

    if (!fs.existsSync(xmlDir)) {
      fs.mkdirSync(xmlDir, { recursive: true });
    }

    // Create network_security_config.xml
    const networkSecurityConfig = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- Allow cleartext traffic for development and API calls -->
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </base-config>
    
    <!-- Specific domain configurations -->
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">nominatim.openstreetmap.org</domain>
        <domain includeSubdomains="true">maps.googleapis.com</domain>
        <domain includeSubdomains="true">firebasestorage.googleapis.com</domain>
        <domain includeSubdomains="true">firebase.googleapis.com</domain>
        <domain includeSubdomains="true">firebaseio.com</domain>
    </domain-config>
</network-security-config>`;

    const xmlPath = path.join(xmlDir, 'network_security_config.xml');
    fs.writeFileSync(xmlPath, networkSecurityConfig);

    return config;
  });
};

module.exports = withNetworkSecurityConfig;
