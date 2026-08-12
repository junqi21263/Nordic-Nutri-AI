import Taro from "@tarojs/taro";
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

  try {
    menuButtonRect = Taro.getMenuButtonBoundingClientRect();
  } catch {
    // Android / devtools may not have capsule
  }

  const m = getOnboardingNavigationMetrics({
    statusBarHeight,
    windowWidth,
    menuButtonRect,
  });

  return {
    ...m,
    safeBottom: getSafeBottom(),
    tabBarHeight: FALLBACK_TAB_BAR,
    screenWidth: getScreenWidth(),
  };
}

let cachedLayout: SystemLayout | null = null;

function getCachedLayout(): SystemLayout {
  if (!cachedLayout) cachedLayout = computeMetrics();
  return cachedLayout;
}

/** Unified system layout hook. Computes once and caches. */
export function useSystemLayout(): SystemLayout {
  return getCachedLayout();
}

export { computeMetrics };
