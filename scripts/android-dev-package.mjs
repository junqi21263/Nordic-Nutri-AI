import { createHash } from "node:crypto";
import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const devApiBaseUrl = "https://test-dev-d4gyxnn0b5dfa2c8a.service.tcloudbase.com";
const expectedPackageId = "com.lewislee.nordicnutri.dev";

function run(command, args, { cwd = projectRoot, env = process.env, label = command } = {}) {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8", shell: false, stdio: "pipe", maxBuffer: 16 * 1024 * 1024 });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw new Error(`${label} failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? 1}`);
  return String(result.stdout ?? "").trim();
}

function readVersion() {
  const gradle = readFileSync(join(projectRoot, "android/app/build.gradle"), "utf8");
  const versionCode = gradle.match(/^\s*versionCode\s+(\d+)\s*$/m)?.[1];
  const versionName = gradle.match(/^\s*versionName\s+["'](\d+\.\d+\.\d+)["']\s*$/m)?.[1];
  if (!versionCode || Number(versionCode) < 1 || !versionName) throw new Error("Android versionCode/versionName is missing or invalid in android/app/build.gradle");
  return { versionCode: Number(versionCode), versionName };
}

function sdkTool(tool) {
  const sdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME || join(homedir(), "Library/Android/sdk");
  const candidates = tool === "apkanalyzer"
    ? [join(sdk, "cmdline-tools/latest/bin/apkanalyzer"), join(sdk, "cmdline-tools/16.0/bin/apkanalyzer")]
    : [join(sdk, "build-tools/36.0.0/apksigner"), join(sdk, "build-tools/35.0.0/apksigner")];
  return candidates.find(existsSync) ?? candidates[0];
}

function buildEnvironment() {
  const localProfile = join(projectRoot, ".env.dev.local");
  if (existsSync(localProfile)) process.loadEnvFile(localProfile);
  if (!(process.env.TARO_APP_GOOGLE_SERVER_CLIENT_ID ?? "").trim()) {
    throw new Error("DEV APK needs TARO_APP_GOOGLE_SERVER_CLIENT_ID. Add it to ignored .env.dev.local; do not commit local environment files.");
  }
  return {
    ...process.env,
    NODE_ENV: "development",
    TARO_APP_ENV: "development",
    TARO_APP_PLATFORM: "android",
    TARO_APP_API_BASE_URL: devApiBaseUrl,
    TARO_APP_ENABLE_REAL_AUTH: "true",
    TARO_APP_USE_REAL_BACKEND: "true",
    ANDROID_HOME: process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME || join(homedir(), "Library/Android/sdk"),
  };
}

function verifyApk(apkPath, version) {
  const apkanalyzer = sdkTool("apkanalyzer");
  const apksigner = sdkTool("apksigner");
  if (!existsSync(apkanalyzer) || !existsSync(apksigner)) throw new Error("Android SDK apkanalyzer/apksigner tools are required");
  const manifest = (property) => run(apkanalyzer, ["manifest", property, apkPath], { label: `APK ${property}` });
  const packageId = manifest("application-id");
  const versionName = manifest("version-name");
  const versionCode = Number(manifest("version-code"));
  const signature = run(apksigner, ["verify", "--verbose", "--print-certs", apkPath], { label: "APK signature verification" });
  const signerSha256 = signature.match(/Signer #1 certificate SHA-256 digest:\s*([0-9a-f:]+)/i)?.[1]?.replaceAll(":", "").toLowerCase();
  if (packageId !== expectedPackageId || versionName !== version.versionName || versionCode !== version.versionCode || !signerSha256) {
    throw new Error("DEV APK package, version, or signature does not match the expected build");
  }
  const apkSha256 = createHash("sha256").update(readFileSync(apkPath)).digest("hex");
  return { packageId, versionName, versionCode, signerSha256, apkSha256, sizeBytes: statSync(apkPath).size };
}

export function buildDevPackage() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major !== 24 || minor < 18) throw new Error(`Use Node.js 24.18.x for Android builds; found ${process.versions.node}`);
  const branch = run("git", ["branch", "--show-current"], { label: "DEV source branch" });
  if (branch !== "Android-dev") throw new Error(`DEV APK must be built from Android-dev; current branch is ${branch || "detached"}`);
  const commit = run("git", ["rev-parse", "HEAD"], { label: "DEV source commit" });
  const remoteCommit = run("git", ["rev-parse", "origin/Android-dev"], { label: "origin/Android-dev commit" });
  if (commit !== remoteCommit) throw new Error("DEV APK source must match the pushed origin/Android-dev commit");
  if (run("git", ["status", "--porcelain", "--untracked-files=no"], { label: "DEV source status" })) {
    throw new Error("Commit tracked source changes before packaging the DEV APK");
  }
  const env = buildEnvironment();
  const version = readVersion();
  const apkPath = join(projectRoot, "android/app/build/outputs/apk/debug/app-debug.apk");
  run("pnpm", ["--dir", join(projectRoot, "mini-program"), "run", "build:android"], { env, label: "DEV web bundle" });
  run("pnpm", ["exec", "cap", "sync", "android"], { env, label: "Capacitor Android sync" });
  run(join(projectRoot, "android/gradlew"), ["-p", "android", "assembleDebug"], { env, label: "DEV Android package" });
  if (!existsSync(apkPath)) throw new Error("Gradle completed without producing the DEV APK");

  const verified = verifyApk(apkPath, version);
  const shortCommit = commit.slice(0, 8);
  const artifactDir = join(projectRoot, "output/android/dev", `${version.versionName}-${version.versionCode}`, shortCommit);
  if (existsSync(artifactDir)) throw new Error(`Refusing to overwrite an existing immutable package directory: ${artifactDir}`);
  mkdirSync(artifactDir, { recursive: true });
  const file = `nordic-nutri-dev-${version.versionName}-${version.versionCode}-${shortCommit}.apk`;
  copyFileSync(apkPath, join(artifactDir, file), constants.COPYFILE_EXCL);
  const manifest = {
    channel: "dev",
    environment: "test-dev-d4gyxnn0b5dfa2c8a",
    branch,
    commit,
    builtAt: new Date().toISOString(),
    ...verified,
    artifact: file,
    verification: { manifest: "PASS", signature: "PASS", realDevice: "NOT VERIFIED" },
  };
  writeFileSync(join(artifactDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  console.log(`DEV package: ${join(artifactDir, file)}`);
  console.log(`SHA-256: ${verified.apkSha256}`);
  console.log("Manifest: manifest.json (device behavior remains NOT VERIFIED until tested on a phone).");
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    buildDevPackage();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
