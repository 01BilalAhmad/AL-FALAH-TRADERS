// Config plugin: Fix Android build compatibility
// Force androidx.activity:activity to 1.9.x (compatible with AGP 8.8.2)
// and set compileSdk to 36
const { withAppBuildGradle } = require('@expo/config-plugins');

/** Update the app-level build.gradle */
function updateAppBuildGradle(buildGradle) {
  // Update compileSdk to 36
  buildGradle = buildGradle.replace(
    /compileSdkVersion\s*=\s*\d+/g,
    'compileSdkVersion = 36'
  );
  buildGradle = buildGradle.replace(
    /compileSdk\s*=\s*\d+/g,
    'compileSdk = 36'
  );
  // Update buildToolsVersion if present
  buildGradle = buildGradle.replace(
    /buildToolsVersion\s*=\s*"[^"]*"/g,
    'buildToolsVersion = "36.0.0"'
  );

  // Add dependency resolution strategy to force compatible versions
  // This forces androidx.activity to 1.9.3 which works with AGP 8.8.2
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
    // Add before dependencies block
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
