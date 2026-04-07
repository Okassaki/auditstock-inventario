// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withAndroidManifest } = require("expo/config-plugins");

/** Sets android:windowSoftInputMode="adjustResize" on MainActivity for react-native-keyboard-controller */
module.exports = function withKeyboardController(config) {
  return withAndroidManifest(config, (c) => {
    const manifest = c.modResults;
    const activities = manifest.manifest?.application?.[0]?.activity ?? [];
    for (const activity of activities) {
      const name = activity.$?.["android:name"] ?? "";
      if (name === ".MainActivity" || name.endsWith("MainActivity")) {
        activity.$["android:windowSoftInputMode"] = "adjustResize";
        break;
      }
    }
    return c;
  });
};
