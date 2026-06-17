const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Fix Sentry React Native Gradle task dependency issue.
 * 
 * Gradle sees two project names: 'sentry-react-native' (hyphens) and
 * 'sentry_react-native' (underscores). They share a build output dir
 * but Gradle doesn't declare a dependency between their tasks, causing:
 *   "Task ':sentry_react-native:packageReleaseResources' uses output of
 *    ':sentry-react-native:generateReleaseResValues' without declaring dependency"
 *
 * This plugin patches settings.gradle to add the missing task dependency.
 */
const withSentryGradleFix = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const buildGradlePath = path.join(
        config.modRequest.platformProjectRoot,
        'build.gradle'
      );
      let contents = fs.readFileSync(buildGradlePath, 'utf-8');

      const SENTRY_FIX_MARKER = '// SENTRY_GRADLE_TASK_DEP_FIX';

      if (!contents.includes(SENTRY_FIX_MARKER)) {
        const fixBlock = `
${SENTRY_FIX_MARKER}
// Fix: sentry_react-native packageReleaseResources depends on
// sentry-react-native generateReleaseResValues but Gradle doesn't know.
subprojects { subproject ->
    subproject.afterEvaluate {
        if (subproject.name == 'sentry_react-native') {
            def sentryHyphen = rootProject.findProject(':sentry-react-native')
            if (sentryHyphen != null) {
                subproject.tasks.matching { it.name.contains('packageReleaseResources') || it.name.contains('packageDebugResources') }.configureEach { task ->
                    def releaseTask = sentryHyphen.tasks.findByName('generateReleaseResValues')
                    def debugTask = sentryHyphen.tasks.findByName('generateDebugResValues')
                    if (releaseTask != null) task.dependsOn(releaseTask)
                    if (debugTask != null) task.dependsOn(debugTask)
                }
            }
        }
    }
}
`;
        contents += fixBlock;
        fs.writeFileSync(buildGradlePath, contents);
        console.log('[withSentryGradleFix] Patched build.gradle with Sentry task dependency fix.');
      } else {
        console.log('[withSentryGradleFix] Fix already applied.');
      }

      return config;
    },
  ]);
};

module.exports = withSentryGradleFix;
