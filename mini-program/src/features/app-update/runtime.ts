import { createAppUpdateCoordinator } from "./coordinator";
import { fetchLatestAndroidRelease } from "./api";
import { getNativeAppInfo } from "./native";
import { useAppUpdateStore, type AppUpdatePhase } from "./store";

const coordinator = createAppUpdateCoordinator({
  getNativeInfo: getNativeAppInfo,
  fetchLatest: fetchLatestAndroidRelease,
  onUpdate: (release) => useAppUpdateStore.getState().show(release),
});

let listenerStarted = false;

function startNativeUpdateEvents() {
  if (listenerStarted || typeof window === "undefined") return;
  listenerStarted = true;
  window.addEventListener("nordicappupdate", ((event: CustomEvent<{ phase?: string; progress?: number }>) => {
    const allowed: AppUpdatePhase[] = ["downloading", "verified", "permission_required", "installing", "failed"];
    const phase = allowed.includes(event.detail?.phase as AppUpdatePhase)
      ? event.detail.phase as AppUpdatePhase
      : "failed";
    useAppUpdateStore.getState().setProgress(phase, Number(event.detail?.progress) || 0);
  }) as EventListener);
}

export async function checkAndroidAppUpdate() {
  if (process.env.TARO_APP_PLATFORM !== "android") return;
  startNativeUpdateEvents();
  await coordinator.check();
}
