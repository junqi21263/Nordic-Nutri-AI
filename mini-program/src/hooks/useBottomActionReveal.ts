import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { mealRecognitionMotionConfig } from "../features/scanner/meal-recognition-motion";

export type BottomActionRevealPhase = "hidden" | "entered";

/**
 * Keeps the fixed result actions mounted in their off-screen state before the
 * final reveal. The nextTick + a second timer guarantees WeChat has committed
 * that hidden state before we switch to the entering state, so the native
 * renderer has an actual transition to animate.
 */
export function useBottomActionReveal(enabled: boolean, replayKey = 0) {
  const [phase, setPhase] = useState<BottomActionRevealPhase>(enabled ? "hidden" : "entered");

  useEffect(() => {
    if (!enabled) {
      setPhase("entered");
      return;
    }

    setPhase("hidden");
    let enterTimeout: ReturnType<typeof setTimeout> | undefined;
    const timelineTimeout = setTimeout(() => {
      Taro.nextTick(() => {
        enterTimeout = setTimeout(() => setPhase("entered"), 32);
      });
    }, mealRecognitionMotionConfig.bottomActionRevealAtMs);

    return () => {
      clearTimeout(timelineTimeout);
      if (enterTimeout) clearTimeout(enterTimeout);
    };
  }, [enabled, replayKey]);

  return { phase };
}
