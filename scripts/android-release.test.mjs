import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSigningEnvironment,
  assertNodeRuntime,
  assertReleaseApk,
  formatReleaseModule,
  loadSigningProfile,
  lookupKeychainPassword,
  readReleaseVersion,
  resolveAndroidSdkRoot,
  redact
} from "./android-release.mjs";

test("requires a local signing profile without displaying profile contents", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "nordic-signing-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  assert.throws(() => loadSigningProfile(join(dir, "missing.json")), /signing\.local\.json/i);
  const keystore = join(dir, "keystore.jks");
  await writeFile(keystore, "test keystore");
  await writeFile(join(dir, "signing.local.json"), JSON.stringify({ keystorePath: keystore, keyAlias: "release" }));
  assert.deepEqual(loadSigningProfile(join(dir, "signing.local.json")), { keystorePath: keystore, keyAlias: "release" });
  await writeFile(join(dir, "signing.local.json"), JSON.stringify({ keystorePath: keystore, keyAlias: "release", password: "must-not-be-stored" }));
  assert.throws(() => loadSigningProfile(join(dir, "signing.local.json")), /non-secret/i);
});

test("requires Node.js 24.18.x for Android release builds", () => {
  assert.equal(assertNodeRuntime("24.18.0"), true);
  assert.throws(() => assertNodeRuntime("25.0.0"), /24\.18/);
});

test("reads the release version from Gradle and rejects missing version metadata", () => {
  assert.deepEqual(readReleaseVersion('versionCode 13\nversionName "1.1.11"'), { versionCode: "13", versionName: "1.1.11" });
  assert.throws(() => readReleaseVersion('versionCode 13'), /version.*build\.gradle/i);
});

test("resolves Android SDK from the configured variables or the standard macOS path", () => {
  assert.equal(resolveAndroidSdkRoot({ androidSdkRoot: "/sdk-root", androidHome: "/android-home", home: "/Users/test" }), "/sdk-root");
  assert.equal(resolveAndroidSdkRoot({ androidHome: "/android-home", home: "/Users/test" }), "/android-home");
  assert.equal(resolveAndroidSdkRoot({ home: "/Users/test" }), "/Users/test/Library/Android/sdk");
});

test("does not include Keychain output in lookup errors", () => {
  const result = lookupKeychainPassword("NordicNutriProdKeystore", () => ({ status: 1, stdout: "secret-value", stderr: "secret-value" }));
  assert.equal(result.ok, false);
  assert.match(result.error.message, /Keychain item unavailable/);
  assert.doesNotMatch(result.error.message, /secret-value/);
});

test("looks up legacy release credentials by the existing service and account", () => {
  let invocation;
  const result = lookupKeychainPassword("com.nordicnutri.prod.signing", (command, args) => {
    invocation = { command, args };
    return { status: 0, stdout: "secret-value\n" };
  }, "keystore");
  assert.deepEqual(invocation, { command: "security", args: ["find-generic-password", "-s", "com.nordicnutri.prod.signing", "-a", "keystore", "-w"] });
  assert.deepEqual(result, { ok: true, value: "secret-value" });
});

test("uses one Keychain value for both Gradle passwords when they match", () => {
  const profile = { keystorePath: "/tmp/release.jks", keyAlias: "release" };
  const signing = createSigningEnvironment(profile, (service) => {
    if (service === "NordicNutriProdKeystore") return { ok: true, value: "local-secret" };
    return { ok: false, error: new Error("missing optional item") };
  });
  assert.equal(signing.env.NORDIC_PROD_KEYSTORE_PASSWORD, "local-secret");
  assert.equal(signing.env.NORDIC_PROD_KEY_PASSWORD, "local-secret");
  assert.equal(signing.env.NORDIC_PROD_KEYSTORE_PATH, profile.keystorePath);
  assert.equal(signing.env.NORDIC_PROD_KEY_ALIAS, profile.keyAlias);
  assert.equal(signing.env.ANDROID_HOME, signing.env.ANDROID_SDK_ROOT);
  assert.ok(signing.env.ANDROID_SDK_ROOT);
  assert.deepEqual(signing.secrets, ["local-secret"]);
});

test("supports a separately stored key password without logging either secret", () => {
  const values = { NordicNutriProdKeystore: "store-secret", NordicNutriProdKey: "key-secret" };
  const signing = createSigningEnvironment({ keystorePath: "/tmp/release.jks", keyAlias: "release" }, (service) => ({ ok: true, value: values[service] }));
  assert.equal(signing.env.NORDIC_PROD_KEYSTORE_PASSWORD, "store-secret");
  assert.equal(signing.env.NORDIC_PROD_KEY_PASSWORD, "key-secret");
  assert.deepEqual(signing.secrets, ["store-secret", "key-secret"]);
  assert.equal(redact("failed store-secret/key-secret", signing.secrets), "failed [REDACTED]/[REDACTED]");
});

test("reuses the legacy Keychain service when new service names are unavailable", () => {
  const values = { keystore: "store-secret", key: "key-secret" };
  const signing = createSigningEnvironment({ keystorePath: "/tmp/release.jks", keyAlias: "release" }, (service, account) => {
    if (service === "com.nordicnutri.prod.signing") return { ok: true, value: values[account] };
    return { ok: false, error: new Error("missing") };
  });
  assert.equal(signing.env.NORDIC_PROD_KEYSTORE_PASSWORD, "store-secret");
  assert.equal(signing.env.NORDIC_PROD_KEY_PASSWORD, "key-secret");
});

test("writes versioned same-origin metadata only for verified APK attributes", () => {
  const content = formatReleaseModule({ versionName: "1.1.9", fileSize: 1024 * 1024, updated: "2026-10-16", sha256: "a".repeat(64) });
  assert.match(content, /url: "\/downloads\/nordic-nutri-android-1\.1\.9\.apk"/);
  assert.match(content, /version: "v1\.1\.9"/);
  assert.ok(content.includes(`sha256: "${"a".repeat(64)}"`));
  assert.throws(() => formatReleaseModule({ versionName: "1.1.8", fileSize: 0, sha256: "bad" }), /metadata/i);
});

test("rejects APKs with a different package, app version, signer, or unsupported size", () => {
  const apk = { packageId: "com.lewislee.nordicnutri", ...readReleaseVersion(), signerSha1: "9a31a756352c92f000b567e29df5a4e6dae7e1ee", fileSize: 1024 };
  assert.equal(assertReleaseApk(apk), true);
  assert.throws(() => assertReleaseApk({ ...apk, packageId: "other.app" }), /release target/i);
  assert.throws(() => assertReleaseApk({ ...apk, signerSha1: "0".repeat(40) }), /release target/i);
  assert.throws(() => assertReleaseApk({ ...apk, versionCode: "11" }), /release target/i);
  assert.throws(() => assertReleaseApk({ ...apk, fileSize: 26 * 1024 * 1024 }), /size/i);
});
