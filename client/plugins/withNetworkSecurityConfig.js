const { withAndroidManifest } = require('expo/config-plugins');
const path = require('path');
const fs = require('fs');

/**
 * Expo config plugin to add network security configuration XML
 * and wire it onto <application android:networkSecurityConfig="...">.
 * Also forces allowBackup=false for release hardening.
 */
const withNetworkSecurityConfig = (config) => {
  return withAndroidManifest(config, (config) => {
    const projectRoot = config.modRequest.projectRoot;
    const xmlDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'xml');

    if (!fs.existsSync(xmlDir)) {
      fs.mkdirSync(xmlDir, { recursive: true });
    }

    const networkSecurityConfig = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- Release/default: HTTPS only, system CAs only -->
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>

    <!-- Debug overrides for local development only -->
    <debug-overrides>
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </debug-overrides>
</network-security-config>`;

    const xmlPath = path.join(xmlDir, 'network_security_config.xml');
    fs.writeFileSync(xmlPath, networkSecurityConfig);

    const app = config.modResults.manifest.application?.[0];
    if (app) {
      app.$ = app.$ || {};
      app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
      app.$['android:allowBackup'] = 'false';
      app.$['android:usesCleartextTraffic'] = 'false';
    }

    return config;
  });
};

module.exports = withNetworkSecurityConfig;
