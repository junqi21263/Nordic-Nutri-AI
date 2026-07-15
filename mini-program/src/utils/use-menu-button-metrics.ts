import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import {
  getOnboardingNavigationMetrics,
  type OnboardingNavigationMetrics,
} from "./onboarding-navigation";

const fallbackMetrics: OnboardingNavigationMetrics = getOnboardingNavigationMetrics({});

function getWindowGeometry() {
  try {
    const windowInfo = Taro.getWindowInfo();
    return {
      statusBarHeight: windowInfo.statusBarHeight,
      windowWidth: windowInfo.windowWidth,
    };
  } catch {
    try {
      const systemInfo = Taro.getSystemInfoSync();
      return {
        statusBarHeight: systemInfo.statusBarHeight,
        windowWidth: systemInfo.windowWidth,
      };
    } catch {
      return undefined;
    }
  }
}

/** Shared WeChat capsule measurement for custom-navigation headers. */
export function useMenuButtonMetrics(): OnboardingNavigationMetrics {
  const [metrics, setMetrics] = useState<OnboardingNavigationMetrics>(fallbackMetrics);

  useEffect(() => {
    try {
      const windowGeometry = getWindowGeometry();
      const menuButtonRect = Taro.getMenuButtonBoundingClientRect();
      setMetrics(
        getOnboardingNavigationMetrics({
          statusBarHeight: windowGeometry?.statusBarHeight,
          windowWidth: windowGeometry?.windowWidth,
          menuButtonRect,
        }),
      );
    } catch {
      setMetrics(fallbackMetrics);
    }
  }, []);

  return metrics;
}
