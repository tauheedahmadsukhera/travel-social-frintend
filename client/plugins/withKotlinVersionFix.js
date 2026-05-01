const { withProjectBuildGradle, withGradleProperties } = require("expo/config-plugins");

const TARGET_KOTLIN_VERSION = "1.9.24";

/**
 * Config plugin to ensure kotlinVersion is defined in the root build.gradle.
 * This fixes the "Could not get unknown property 'kotlinVersion'" error during EAS build.
 */
const withKotlinVersionFix = (config) => {
  config = withProjectBuildGradle(config, (config) => {
    if (config.modResults.language === "groovy") {
      let content = config.modResults.contents;
      
      // Always normalize Kotlin version assignments to avoid Compose compatibility issues.
      content = content
        .replace(/kotlinVersion\s*=\s*["'][^"']+["']/g, `kotlinVersion = "${TARGET_KOTLIN_VERSION}"`)
        .replace(/kotlin_version\s*=\s*["'][^"']+["']/g, `kotlin_version = "${TARGET_KOTLIN_VERSION}"`)
        .replace(/android\.kotlinVersion\s*=\s*["'][^"']+["']/g, `android.kotlinVersion=${TARGET_KOTLIN_VERSION}`);

      // If no ext kotlinVersion is present, inject one into buildscript.ext.
      if (!content.includes("kotlinVersion =") && !content.includes("kotlinVersion=")) {
        console.log("Adding kotlinVersion to root build.gradle...");
        const extBlock = `
buildscript {
    ext {
        kotlinVersion = "${TARGET_KOTLIN_VERSION}"
        kotlin_version = "${TARGET_KOTLIN_VERSION}"
    }
`;
        content = content.replace(/buildscript\s*{/, extBlock);
      }

      // Keep kotlin gradle plugin classpath tied to ext.kotlinVersion.
      content = content.replace(
        /classpath\s*\(['"]org\.jetbrains\.kotlin:kotlin-gradle-plugin:[^'"]+['"]\)/,
        `classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:\$kotlinVersion")`
      );
      content = content.replace(
        /classpath\s*\(["']org\.jetbrains\.kotlin:kotlin-gradle-plugin["']\)/,
        `classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:\$kotlinVersion")`
      );

      const suppressFlag = "suppressKotlinVersionCompatibilityCheck=true";
      if (!content.includes(suppressFlag)) {
        content += `

subprojects {
  tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
    kotlinOptions {
      freeCompilerArgs += [
        "-P",
        "plugin:androidx.compose.compiler.plugins.kotlin:suppressKotlinVersionCompatibilityCheck=true"
      ]
    }
  }
}
`;
      }
      
      config.modResults.contents = content;
    }
    return config;
  });

  // Ensure android.kotlinVersion in gradle.properties is pinned as well.
  config = withGradleProperties(config, (config) => {
    const props = config.modResults;
    const propName = "android.kotlinVersion";
    const existing = props.find((item) => item.type === "property" && item.key === propName);

    if (existing) {
      existing.value = TARGET_KOTLIN_VERSION;
    } else {
      props.push({ type: "property", key: propName, value: TARGET_KOTLIN_VERSION });
    }

    return config;
  });

  return config;
};

module.exports = withKotlinVersionFix;
