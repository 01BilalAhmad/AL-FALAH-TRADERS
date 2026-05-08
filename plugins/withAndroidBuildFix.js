// Config plugin: Fix Android build compatibility
// Force compatible androidx.activity version for AGP stability
const { withAppBuildGradle } = require('@expo/config-plugins');

/** Update the app-level build.gradle */
function updateAppBuildGradle(buildGradle) {
  // Add dependency resolution strategy to force compatible versions
  const forceDepsBlock = `
    configurations.all {
      resolutionStrategy {
        force 'androidx.activity:activity:1.9.3'
        force 'androidx.activity:activity-ktx:1.9.3'
      }
    }
  `;

  // Only add if not already present
  if (!buildGradle.includes("force 'androidx.activity:activity:1.9.3'")) {
    buildGradle = buildGradle.replace(
      /dependencies\s*\{/,
      `${forceDepsBlock}\ndependencies {`
    );
  }

  return buildGradle;
}

module.exports = function withAndroidBuildFix(config) {
  config = withAppBuildGradle(config, (modConfig) => {
    modConfig.modResults.contents = updateAppBuildGradle(
      modConfig.modResults.contents
    );
    return modConfig;
  });

  return config;
};
