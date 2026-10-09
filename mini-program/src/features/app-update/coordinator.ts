import type { AndroidRelease, AppUpdateChannel, AppVersionResponse, NativeAppInfo } from "./types";

export function selectUpdate(installed: Pick<NativeAppInfo, "versionCode">, response: AppVersionResponse) {
  const release = response.update;
  return release && Number.isFinite(release.versionCode) && release.versionCode > installed.versionCode
    ? release
    : null;
}

export function createAppUpdateCoordinator(dependencies: {
  getNativeInfo: () => Promise<NativeAppInfo>;
  fetchLatest: (channel: AppUpdateChannel) => Promise<AppVersionResponse>;
  onUpdate: (release: AndroidRelease) => void;
}) {
  let checked = false;
  let inFlight: Promise<void> | null = null;
  return {
    check() {
      if (checked) return inFlight ?? Promise.resolve();
      if (!inFlight) {
        inFlight = (async () => {
          const installed = await dependencies.getNativeInfo();
          const channel: AppUpdateChannel = installed.installerPackage ? "market" : "direct";
          const release = selectUpdate(installed, await dependencies.fetchLatest(channel));
          if (release) dependencies.onUpdate(release);
          checked = true;
        })().catch(() => {
          // Update discovery is optional and must never block Home.
        }).finally(() => {
          inFlight = null;
        });
      }
      return inFlight;
    },
  };
}
