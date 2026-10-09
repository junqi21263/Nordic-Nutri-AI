import type { NativeAppInfo } from "./types";

type NativeUpdateBridge = {
  getInfo: () => string;
  openMarket: (url: string) => boolean;
  downloadAndInstall: (url: string, sha256: string) => boolean;
};

function bridge() {
  return (globalThis as { NordicAppUpdate?: NativeUpdateBridge }).NordicAppUpdate;
}

export async function getNativeAppInfo(): Promise<NativeAppInfo> {
  const raw = bridge()?.getInfo();
  if (!raw) throw new Error("Native updater unavailable");
  const value = JSON.parse(raw) as Partial<NativeAppInfo>;
  if (!Number.isFinite(value.versionCode)) throw new Error("Native version unavailable");
  return {
    versionCode: Number(value.versionCode),
    versionName: typeof value.versionName === "string" ? value.versionName : "",
    installerPackage: typeof value.installerPackage === "string" ? value.installerPackage : null,
  };
}

export function openNativeMarket(url: string) {
  return bridge()?.openMarket(url) === true;
}

export function installVerifiedApk(url: string, sha256: string) {
  return bridge()?.downloadAndInstall(url, sha256) === true;
}
