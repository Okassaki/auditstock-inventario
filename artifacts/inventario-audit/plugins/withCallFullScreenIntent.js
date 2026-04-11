const { withAndroidManifest, withDangerousMod, withAppBuildGradle } = require("@expo/config-plugins");
const fs   = require("fs");
const path = require("path");

/**
 * Plugin that adds WhatsApp-style incoming call notifications:
 *  - Copies CallNotificationService.kt (extends ExpoFirebaseMessagingService)
 *    and CallRejectReceiver.kt to the Android source tree.
 *  - Adds USE_FULL_SCREEN_INTENT permission.
 *  - Registers our service (priority 1) so it wins over Expo's (priority -1)
 *    for FCM MESSAGING_EVENT, while still delegating non-call messages to super.
 *  - Registers the BroadcastReceiver for "Rechazar" button.
 */
function withCallFullScreenIntent(config) {
  // ── 1. Copy Kotlin source files ──────────────────────────────────────────
  config = withDangerousMod(config, [
    "android",
    (cfg) => {
      // __dirname = artifacts/inventario-audit/plugins/
      // Android source lives one level up under android/
      const pkgDir = path.join(
        __dirname, "..",
        "android", "app", "src", "main", "java",
        "com", "auditstock", "inventario"
      );
      fs.mkdirSync(pkgDir, { recursive: true });

      for (const file of ["CallNotificationService.kt", "CallRejectReceiver.kt"]) {
        fs.copyFileSync(
          path.join(__dirname, file),
          path.join(pkgDir, file)
        );
      }
      return cfg;
    },
  ]);

  // ── 2. Add firebase-messaging dependency to app/build.gradle ────────────
  config = withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes("firebase-messaging")) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /dependencies\s*\{/,
        `dependencies {\n    implementation 'com.google.firebase:firebase-messaging:24.0.3'\n`
      );
    }
    return cfg;
  });

  // ── 3. Patch AndroidManifest.xml ─────────────────────────────────────────
  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const app      = manifest.manifest.application[0];

    // a) USE_FULL_SCREEN_INTENT permission
    if (!manifest.manifest["uses-permission"]) manifest.manifest["uses-permission"] = [];
    const perms = manifest.manifest["uses-permission"];
    if (!perms.some(p => p.$?.["android:name"] === "android.permission.USE_FULL_SCREEN_INTENT")) {
      perms.push({ $: { "android:name": "android.permission.USE_FULL_SCREEN_INTENT" } });
    }

    // b) Register our CallNotificationService with priority 1 (higher than Expo's -1)
    //    so it handles ALL FCM messages first and delegates non-call ones to super().
    if (!app.service) app.service = [];
    if (!app.service.some(s => s.$?.["android:name"] === "com.auditstock.inventario.CallNotificationService")) {
      app.service.push({
        $: {
          "android:name":     "com.auditstock.inventario.CallNotificationService",
          "android:exported": "false",
        },
        "intent-filter": [{
          $: { "android:priority": "1" },
          action: [{ $: { "android:name": "com.google.firebase.MESSAGING_EVENT" } }],
        }],
      });
    }

    // c) Register CallRejectReceiver for the "Rechazar" PendingIntent
    if (!app.receiver) app.receiver = [];
    if (!app.receiver.some(r => r.$?.["android:name"] === "com.auditstock.inventario.CallRejectReceiver")) {
      app.receiver.push({
        $: {
          "android:name":     "com.auditstock.inventario.CallRejectReceiver",
          "android:exported": "false",
        },
        "intent-filter": [{
          action: [{ $: { "android:name": "com.auditstock.inventario.REJECT_CALL" } }],
        }],
      });
    }

    return cfg;
  });

  return config;
}

module.exports = withCallFullScreenIntent;
