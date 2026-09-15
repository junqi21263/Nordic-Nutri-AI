import Taro from "@tarojs/taro";
import { useSyncExternalStore } from "react";
import {
  getOnboardingNavigationMetrics,
  type OnboardingNavigationMetrics,
  type MenuButtonRect,
} from "../utils/onboarding-navigation";

export interface SystemLayout extends OnboardingNavigationMetrics {
  /** Tab bar total height including safe-area bottom. */
  tabBarHeight: number;
  /** Safe-area bottom inset. */
  safeBottom: number;
  /** Screen width in px. */
  screenWidth: number;
}

const FALLBACK_STATUS_BAR = 44;
const FALLBACK_TAB_BAR = 56;
const isWeChatRuntime = process.env.TARO_ENV === "weapp";

function finiteInset(value: number, fallback = 0): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function getSafeBottom(): number {
  try {
    const win = Taro.getWindowInfo();
    return win.safeArea?.bottom ? win.screenHeight - win.safeArea.bottom : 0;
  } catch {
    try {
      const sys = Taro.getSystemInfoSync();
      return sys.safeArea?.bottom ? sys.screenHeight - sys.safeArea.bottom : 0;
    } catch {
      return 0;
    }
  }
}

function getScreenWidth(): number {
  try {
    return Taro.getWindowInfo().windowWidth;
  } catch {
    try {
      return Taro.getSystemInfoSync().windowWidth;
    } catch {
      return 375;
    }
  }
}

function computeMetrics(): SystemLayout {
  let statusBarHeight = FALLBACK_STATUS_BAR;
  let windowWidth = 375;
  let menuButtonRect: MenuButtonRect | null = null;

  try {
    const win = Taro.getWindowInfo();
    statusBarHeight = win.statusBarHeight ?? FALLBACK_STATUS_BAR;
    windowWidth = win.windowWidth;
  } catch {
    try {
      const sys = Taro.getSystemInfoSync();
      statusBarHeight = sys.statusBarHeight ?? FALLBACK_STATUS_BAR;
      windowWidth = sys.windowWidth;
    } catch {
      // keep fallbacks
    }
  }

  if (isWeChatRuntime) {
    try {
      menuButtonRect = Taro.getMenuButtonBoundingClientRect();
    } catch {
      // Android / devtools may not have capsule
    }
  }

  const m = getOnboardingNavigationMetrics({
    // The native Android container already excludes the system status bar.
    // H5 can report NaN here; it must never become an invalid CSS padding.
    statusBarHeight: isWeChatRuntime ? finiteInset(statusBarHeight, FALLBACK_STATUS_BAR) : 0,
    windowWidth: finiteInset(windowWidth, 375),
    menuButtonRect,
  });

  return {
    ...m,
    safeBottom: finiteInset(getSafeBottom()),
    tabBarHeight: FALLBACK_TAB_BAR,
    screenWidth: finiteInset(getScreenWidth(), 375),
  };
}

let cachedLayout: SystemLayout | null = null;

function getCachedLayout(): SystemLayout {
  if (!cachedLayout) cachedLayout = computeMetrics();
  return cachedLayout;
}

const listeners = new Set<() => void>();

function refreshLayout() {
  cachedLayout = computeMetrics();
  listeners.forEach((notify) => notify());
}

function subscribeLayout(notify: () => void) {
  if (listeners.size === 0) {
    Taro.onWindowResize(refreshLayout);
    // Also refresh after pages remount following an inactive interval.
    cachedLayout = computeMetrics();
  }
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
    if (listeners.size === 0) Taro.offWindowResize(refreshLayout);
  };
}

/** One shared snapshot, refreshed when the viewport changes. */
export function useSystemLayout(): SystemLayout {
  return useSyncExternalStore(subscribeLayout, getCachedLayout, getCachedLayout);
}

export { computeMetrics };
