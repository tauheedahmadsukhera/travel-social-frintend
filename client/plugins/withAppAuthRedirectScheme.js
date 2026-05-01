const { withAppBuildGradle } = require('expo/config-plugins');

const REDIRECT_SCHEME = 'trave-social';

function ensureManifestPlaceholderInDefaultConfig(buildGradle) {
  const defaultConfigRegex = /(defaultConfig\s*\{)([\s\S]*?)(\n\s*\})/m;
  const match = buildGradle.match(defaultConfigRegex);

  if (!match) {
    return { updated: buildGradle, changed: false };
  }

  const start = match[1];
  let body = match[2];
  const end = match[3];

  const placeholdersRegex = /(manifestPlaceholders\s*=\s*\[)([\s\S]*?)(\])/m;

  if (placeholdersRegex.test(body)) {
    body = body.replace(placeholdersRegex, (full, open, placeholderBody, close) => {
      if (/appAuthRedirectScheme\s*:/.test(placeholderBody)) {
        const normalized = placeholderBody.replace(
          /appAuthRedirectScheme\s*:\s*['"][^'"]+['"]/,
          `appAuthRedirectScheme: '${REDIRECT_SCHEME}'`
        );
        return `${open}${normalized}${close}`;
      }

      const trimmed = placeholderBody.trimEnd();
      const needsComma = trimmed.length > 0 && !trimmed.trim().endsWith(',');
      const separator = needsComma ? ',' : '';
      return `${open}${placeholderBody}${separator}\n            appAuthRedirectScheme: '${REDIRECT_SCHEME}'\n        ${close}`;
    });
  } else {
    body += `\n\n        // Manifest placeholders for react-native-app-auth\n        manifestPlaceholders = [\n            appAuthRedirectScheme: '${REDIRECT_SCHEME}'\n        ]\n`;
  }

  const updatedBlock = `${start}${body}${end}`;
  return {
    updated: buildGradle.replace(defaultConfigRegex, updatedBlock),
    changed: updatedBlock !== match[0],
  };
}

/**
 * Config plugin to add appAuthRedirectScheme to build.gradle
 * This ensures the placeholder is set even after expo prebuild
 */
const withAppAuthRedirectScheme = (config) => {
  return withAppBuildGradle(config, (config) => {
    const { modResults } = config;
    const { updated, changed } = ensureManifestPlaceholderInDefaultConfig(modResults.contents);

    if (changed) {
      modResults.contents = updated;
      console.log('✅ Ensured appAuthRedirectScheme manifest placeholder in build.gradle');
    } else {
      console.log('ℹ️ appAuthRedirectScheme manifest placeholder already configured');
    }

    return config;
  });
};

module.exports = withAppAuthRedirectScheme;

