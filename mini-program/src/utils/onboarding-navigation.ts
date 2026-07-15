export interface MenuButtonRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface OnboardingNavigationInput {
  statusBarHeight?: number;
  windowWidth?: number;
  menuButtonRect?: MenuButtonRect | null;
}

export interface OnboardingNavigationMetrics {
  statusBarHeight: number;
  navigationBarHeight: number;
  totalHeaderHeight: number;
  /** @deprecated Use totalHeaderHeight for shared navigation layouts. */
  headerHeight: number;
  rightInset: number;
  titleMaxWidth: number;
}

const minimumHeaderHeight = 44;
const capsuleGap = 8;

/**
 * Converts WeChat's device-pixel menu-button rect into the two layout values
 * used by the compact onboarding header. The fallback keeps Android and tests
 * usable when the rect API is unavailable.
 */
export function getOnboardingNavigationMetrics({
  statusBarHeight = 0,
  windowWidth = 0,
  menuButtonRect,
}: OnboardingNavigationInput): OnboardingNavigationMetrics {
  const navigationBarHeight = menuButtonRect
    ? Math.max(
        minimumHeaderHeight,
        (menuButtonRect.top - statusBarHeight) * 2 + menuButtonRect.height,
      )
    : minimumHeaderHeight;
  const totalHeaderHeight = statusBarHeight + navigationBarHeight;

  if (!menuButtonRect) {
    return {
      statusBarHeight,
      navigationBarHeight,
      totalHeaderHeight,
      headerHeight: totalHeaderHeight,
      rightInset: 0,
      titleMaxWidth: windowWidth,
    };
  }

  const rightInset = Math.max(0, windowWidth - menuButtonRect.left + capsuleGap);
  // Use an even-width centered region so an odd-pixel viewport cannot shift a
  // title half a pixel toward the WeChat capsule.
  const titleMaxWidth = Math.max(0, windowWidth - rightInset * 2 - (windowWidth % 2));

  return {
    statusBarHeight,
    navigationBarHeight,
    totalHeaderHeight,
    headerHeight: totalHeaderHeight,
    rightInset,
    titleMaxWidth,
  };
}
