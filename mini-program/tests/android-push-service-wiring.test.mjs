import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const manifest = fs.readFileSync(new URL("../../android/app/src/main/AndroidManifest.xml", import.meta.url), "utf8");
const service = fs.readFileSync(new URL("../../android/app/src/main/java/com/lewislee/nordicnutri/NordicFirebaseMessagingService.java", import.meta.url), "utf8");
const activity = fs.readFileSync(new URL("../../android/app/src/main/java/com/lewislee/nordicnutri/MainActivity.java", import.meta.url), "utf8");
const adapter = fs.readFileSync(new URL("../src/platform/android-push-notifications.ts", import.meta.url), "utf8");

test("Android has one FCM message service and forwards Capacitor events", () => {
  assert.equal((manifest.match(/com\.google\.firebase\.MESSAGING_EVENT/g) ?? []).length, 1);
  assert.match(manifest, /com\.capacitorjs\.plugins\.pushnotifications\.MessagingService[\s\S]*tools:node="remove"/);
  assert.match(service, /PushNotificationsPlugin\.sendRemoteMessage\(message\)/);
  assert.match(service, /PushNotificationsPlugin\.onNewToken\(token\)/);
});

test("a notification opened while Android is running reaches the WebView", () => {
  assert.match(activity, /nordicpushintent/);
  assert.match(activity, /evaluateJavascript/);
  assert.match(adapter, /addEventListener\("nordicpushintent"/);
});
