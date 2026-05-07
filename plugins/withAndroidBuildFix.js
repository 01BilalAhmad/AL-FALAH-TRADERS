// Config plugin: Fix Android build compatibility
// Force androidx.activity:activity to 1.9.x (compatible with AGP 8.8.2)
// Set compileSdkVersion to 36
const {
  withAppBuildGradle,
  withProjectBuildGradle,
} = require('@expo/config-plugins');

/** Update the project-level build.gradle to use AGP 8.9.1 */
function updateProjectBuildGradle(buildGradle) {
  // Update AGP version in classpath declaration
  buildGradle = buildGradle.replace(
    /com\.android\.tools\.build:gradle:\d+\.\d+\.\d+/g,
    'com.android.tools.build:gradle:8.9.1'
  );
  return buildGradle;
}

/** Update the app-level build.gradle */
function updateAppBuildGradle(buildGradle) {
  // Update compileSdk
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
  const forceDepsBlock = `
    // Force compatible androidx.activity version for AGP 8.8.2
    configurations.all {
      resolutionStrategy {
        force 'androidx.activity:activity:1.9.3'
        force 'androidx.activity:activity-ktx:1.9.3'
      }
    }
  `;

  // Only add if not already present
  if (!buildGradle.includes("force 'androidx.activity:activity:1.9.3'")) {
    // Add after the android block closing brace
    buildGradle = buildGradle.replace(
      /(android\s*\{[\s\S]*?\n\})\s*\n/,
      `$1\n${forceDepsBlock}\n`
    );

    // If the above didn't match, try adding before dependencies
    if (!buildGradle.includes("force 'androidx.activity:activity:1.9.3'")) {
      buildGradle = buildGradle.replace(
        /dependencies\s*\{/,
        `${forceDepsBlock}\ndependencies {`
      );
    }
  }

  return buildGradle;
}

module.exports = function withAndroidBuildFix(config) {
  config = withProjectBuildGradle(config, (modConfig) => {
    modConfig.modResults.contents = updateProjectBuildGradle(
      modConfig.modResults.contents
    );
    return modConfig;
  });

  config = withAppBuildGradle(config, (modConfig) => {
    modConfig.modResults.contents = updateAppBuildGradle(
      modConfig.modResults.contents
    );
    return modConfig;
  });

  return config;
};
