// Config plugin: Fix Android build compatibility
// 1. Update Android Gradle Plugin version to 8.9.1+ for androidx.activity:activity-ktx:1.11.0
// 2. Set compileSdkVersion to 36
const {
  withAppBuildGradle,
  withProjectBuildGradle,
  withSettingsGradle,
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

/** Update the app-level build.gradle to use compileSdk 36 */
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
  return buildGradle;
}

/** Update settings.gradle for AGP plugin version */
function updateSettingsGradle(settingsGradle) {
  // Update AGP version in plugins block
  settingsGradle = settingsGradle.replace(
    /id\s+"com\.android\.application"\s+version\s+"[\d.]+"/g,
    'id "com.android.application" version "8.9.1"'
  );
  settingsGradle = settingsGradle.replace(
    /id\s+"com\.android\.library"\s+version\s+"[\d.]+"/g,
    'id "com.android.library" version "8.9.1"'
  );
  return settingsGradle;
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

  config = withSettingsGradle(config, (modConfig) => {
    modConfig.modResults.contents = updateSettingsGradle(
      modConfig.modResults.contents
    );
    return modConfig;
  });

  return config;
};
