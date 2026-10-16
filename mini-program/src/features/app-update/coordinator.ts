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
  let inFlight: Promise<AndroidRelease | null> | null = null;
  const runCheck = async () => {
    const installed = await dependencies.getNativeInfo();
    const channel: AppUpdateChannel = installed.installerPackage ? "market" : "direct";
    const release = selectUpdate(installed, await dependencies.fetchLatest(channel));
    if (release) dependencies.onUpdate(release);
    checked = true;
    return release;
  };
  return {
    check() {
      if (checked) return inFlight?.then(() => undefined) ?? Promise.resolve();
      if (!inFlight) {
        inFlight = runCheck().catch(() => {
          // Update discovery is optional and must never block Home.
          return null;
        }).finally(() => {
          inFlight = null;
        });
      }
      return inFlight.then(() => undefined);
    },
    async checkNow() {
      if (inFlight) {
        const current = await inFlight;
        if (current) return current;
      }
      const request = runCheck().finally(() => {
        if (inFlight === request) inFlight = null;
      });
      inFlight = request;
      return request;
    },
  };
}
