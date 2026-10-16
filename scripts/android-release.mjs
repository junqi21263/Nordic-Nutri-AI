import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const siteRoot = process.env.NORDIC_PUBLIC_SITE_DIR || join(projectRoot, "sites/nordic-public");
const androidRoot = projectRoot;
const expected = Object.freeze({ packageId: "com.lewislee.nordicnutri", signerSha1: "9a31a756352c92f000b567e29df5a4e6dae7e1ee" });

export function readReleaseVersion(gradle = readFileSync(join(projectRoot, "android/app/build.gradle"), "utf8")) {
  const versionCode = gradle.match(/^\s*versionCode\s+(\d+)\s*$/m)?.[1];
  const versionName = gradle.match(/^\s*versionName\s+["'](\d+\.\d+\.\d+)["']\s*$/m)?.[1];
  if (!versionCode || Number(versionCode) < 1 || !versionName) throw new Error("Android release version is missing or invalid in build.gradle");
  return { versionCode, versionName };
}

export function assertNodeRuntime(version = process.versions.node) {
  const [major, minor] = version.split(".").map(Number);
  if (major !== 24 || minor < 18) throw new Error(`Use Node.js 24.18.x for Android releases; found ${version}`);
  return true;
}

export function loadSigningProfile(profilePath) {
  if (!existsSync(profilePath)) throw new Error("Local signing profile missing: android/signing.local.json");
  let profile;
  try {
    profile = JSON.parse(readFileSync(profilePath, "utf8"));
  } catch {
    throw new Error("Local signing profile is invalid JSON");
  }
  if (typeof profile.keystorePath !== "string" || !profile.keystorePath || typeof profile.keyAlias !== "string" || !profile.keyAlias) {
    throw new Error("Local signing profile requires keystorePath and keyAlias");
  }
  if (Object.keys(profile).some((key) => !["keystorePath", "keyAlias"].includes(key))) throw new Error("Local signing profile may contain non-secret keystore metadata only");
  if (!existsSync(profile.keystorePath)) throw new Error("Configured keystore file is unavailable");
  return { keystorePath: profile.keystorePath, keyAlias: profile.keyAlias };
}

export function lookupKeychainPassword(service, runner = spawnSync, account) {
  const args = ["find-generic-password", "-s", service];
  if (account) args.push("-a", account);
  args.push("-w");
  const result = runner("security", args, { encoding: "utf8", shell: false, stdio: "pipe" });
  if (result.error || result.status !== 0) return { ok: false, error: new Error(`Keychain item unavailable: ${service}`) };
  const value = String(result.stdout ?? "").replace(/[\r\n]+$/, "");
  if (!value) return { ok: false, error: new Error(`Keychain item is empty: ${service}`) };
  return { ok: true, value };
}

export function resolveAndroidSdkRoot({ androidSdkRoot = process.env.ANDROID_SDK_ROOT, androidHome = process.env.ANDROID_HOME, home = homedir() } = {}) {
  return androidSdkRoot || androidHome || join(home, "Library/Android/sdk");
}

export function createSigningEnvironment(profile, lookup = (service, account) => lookupKeychainPassword(service, spawnSync, account)) {
  const storedPassword = (service, legacyAccount) => {
    const current = lookup(service);
    if (current.ok) return current;
    const legacy = lookup("com.nordicnutri.prod.signing", legacyAccount);
    return legacy.ok ? legacy : current;
  };
  const store = storedPassword("NordicNutriProdKeystore", "keystore");
  if (!store.ok) throw store.error;
  const separateKey = storedPassword("NordicNutriProdKey", "key");
  const keyPassword = separateKey.ok ? separateKey.value : store.value;
  const androidSdkRoot = resolveAndroidSdkRoot();
  return {
    env: {
      ...process.env,
      ANDROID_HOME: androidSdkRoot,
      ANDROID_SDK_ROOT: androidSdkRoot,
      NORDIC_PROD_KEYSTORE_PATH: profile.keystorePath,
      NORDIC_PROD_KEYSTORE_PASSWORD: store.value,
      NORDIC_PROD_KEY_ALIAS: profile.keyAlias,
      NORDIC_PROD_KEY_PASSWORD: keyPassword
    },
    secrets: [store.value, ...(separateKey.ok ? [separateKey.value] : [])]
  };
}

export function redact(value, secrets) {
  let output = String(value ?? "");
  for (const secret of secrets.filter(Boolean)) output = output.split(secret).join("[REDACTED]");
  return output;
}

export function formatReleaseModule({ versionName, fileSize, updated = new Date().toISOString().slice(0, 10), sha256 }) {
  if (!/^\d+\.\d+\.\d+$/.test(versionName ?? "") || !Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > 25 * 1024 * 1024 || !/^\d{4}-\d{2}-\d{2}$/.test(updated ?? "") || !/^[0-9a-f]{64}$/.test(sha256 ?? "")) {
    throw new Error("Verified APK metadata is incomplete or invalid");
  }
  const file = `nordic-nutri-android-${versionName}-${sha256.slice(0, 12)}.apk`;
  const size = `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;
  return `// This version is signed with the production certificate and checked by the build.\nexport const release = Object.freeze({\n  url: "/downloads/${file}",\n  file: "${file}",\n  version: "v${versionName}",\n  size: "${size}",\n  updated: "${updated}",\n  sha256: "${sha256}"\n});\n`;
}

export function assertReleaseApk({ packageId, versionName, versionCode, signerSha1, fileSize }, releaseVersion = readReleaseVersion()) {
  if (packageId !== expected.packageId || versionName !== releaseVersion.versionName || String(versionCode) !== releaseVersion.versionCode || signerSha1?.replaceAll(":", "").toLowerCase() !== expected.signerSha1) {
    throw new Error("APK package, version, or signer does not match the release target");
  }
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > 25 * 1024 * 1024) throw new Error("APK size is outside the supported range");
  return true;
}

function capture(command, args, { cwd, env, secrets = [], label = command } = {}) {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8", shell: false, stdio: "pipe", maxBuffer: 16 * 1024 * 1024 });
  const stdout = redact(result.stdout, secrets);
  const stderr = redact(result.stderr, secrets);
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  if (result.error) throw new Error(`${label} failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? 1}`);
  return stdout;
}

function sdkTool(tool) {
  const sdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME || join(homedir(), "Library/Android/sdk");
  const candidates = tool === "apkanalyzer"
    ? [join(sdk, "cmdline-tools/latest/bin/apkanalyzer"), join(sdk, "cmdline-tools/16.0/bin/apkanalyzer")]
    : [join(sdk, "build-tools/36.0.0/apksigner"), join(sdk, "build-tools/35.0.0/apksigner")];
  return candidates.find(existsSync) ?? candidates[0];
}

function verifyApk(apkPath) {
  const apkanalyzer = sdkTool("apkanalyzer");
  const apksigner = sdkTool("apksigner");
  if (!existsSync(apkanalyzer) || !existsSync(apksigner)) throw new Error("Android SDK apkanalyzer/apksigner tools are required");
  const readManifest = (property) => capture(apkanalyzer, ["manifest", property, apkPath], { label: `APK ${property}` }).trim();
  const packageId = readManifest("application-id");
  const versionName = readManifest("version-name");
  const versionCode = readManifest("version-code");
  const signing = capture(apksigner, ["verify", "--verbose", "--print-certs", apkPath], { label: "APK signature verification" });
  const signer = signing.match(/Signer #1 certificate SHA-1 digest:\s*([0-9a-f:]+)/i)?.[1]?.replaceAll(":", "").toLowerCase();
  const fileSize = statSync(apkPath).size;
  assertReleaseApk({ packageId, versionName, versionCode, signerSha1: signer, fileSize });
  return { versionName, fileSize, sha256: createHash("sha256").update(readFileSync(apkPath)).digest("hex") };
}

export function buildRelease({ profilePath = process.env.NORDIC_SIGNING_PROFILE || join(projectRoot, "android/signing.local.json") } = {}) {
  assertNodeRuntime();
  const branch = capture("git", ["branch", "--show-current"], { cwd: androidRoot, label: "Release source branch" }).trim();
  const commit = capture("git", ["rev-parse", "HEAD"], { cwd: androidRoot, label: "Release source commit" }).trim();
  const prodCommit = capture("git", ["rev-parse", "origin/Android-prod"], { cwd: androidRoot, label: "Android-prod source commit" }).trim();
  if (commit !== prodCommit) throw new Error(`Release source must match the pushed Android-prod commit (current branch: ${branch})`);
  if (capture("git", ["status", "--porcelain"], { cwd: androidRoot, label: "Release source status" }).trim()) {
    throw new Error("Release source must be committed before packaging");
  }
  if (!existsSync(resolveAndroidSdkRoot())) throw new Error("Android SDK is unavailable; configure ANDROID_HOME or ANDROID_SDK_ROOT");
  const profile = loadSigningProfile(profilePath);
  const signing = createSigningEnvironment(profile);
  const gradle = join(androidRoot, "android/gradlew");
  const apkPath = join(androidRoot, "android/app/build/outputs/apk/release/app-release.apk");
  capture("pnpm", ["--dir", join(androidRoot, "mini-program"), "run", "build:android:prod"], { cwd: androidRoot, env: signing.env, secrets: signing.secrets, label: "Production web bundle" });
  capture("pnpm", ["exec", "cap", "sync", "android"], { cwd: androidRoot, env: signing.env, secrets: signing.secrets, label: "Capacitor Android sync" });
  capture(gradle, ["-p", "android", "assembleRelease"], { cwd: androidRoot, env: signing.env, secrets: signing.secrets, label: "Signed Android release build" });
  if (!existsSync(apkPath)) throw new Error("Gradle completed without producing the release APK");
  const metadata = verifyApk(apkPath);
  const file = `nordic-nutri-android-${metadata.versionName}-${metadata.sha256.slice(0, 12)}.apk`;
  const destination = join(siteRoot, "public/downloads", file);
  if (!existsSync(join(siteRoot, "wrangler.jsonc"))) throw new Error("Production website source is unavailable");
  const temporaryApk = `${destination}.tmp`;
  const temporaryMetadata = join(siteRoot, "src/release.mjs.tmp");
  copyFileSync(apkPath, temporaryApk);
  renameSync(temporaryApk, destination);
  writeFileSync(temporaryMetadata, formatReleaseModule(metadata), { mode: 0o600 });
  renameSync(temporaryMetadata, join(siteRoot, "src/release.mjs"));
  console.log(`Verified ${file}; SHA-256 ${metadata.sha256}; signer matches the existing production certificate.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    buildRelease();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
