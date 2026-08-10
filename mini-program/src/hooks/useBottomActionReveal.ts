import Taro from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import { mealRecognitionMotionConfig, type MealRecognitionMotionPhase } from "../features/scanner/meal-recognition-motion";

export type BottomActionRevealPhase = "hidden" | "entered";

const BOTTOM_ACTION_ID = "meal-bottom-action";
const BOTTOM_ACTION_SAFE_OFFSET_PX = 20;
const PAINT_WAIT_MS = 24;

type BottomActionAnimation = Record<string, unknown>;

function logBottomReveal(message: string, resultRevealPhase: MealRecognitionMotionPhase) {
  if (process.env.NODE_ENV === "production") return;
  console.info(`[BottomReveal] ${message}`, { resultRevealPhase });
}

function getViewportOffset() {
  try {
    return Taro.getWindowInfo().windowHeight + BOTTOM_ACTION_SAFE_OFFSET_PX;
  } catch {
    return 1000;
  }
}

function createBottomActionAnimation(offset: number, duration: number) {
  const animation = Taro.createAnimation({
    duration,
    timingFunction: duration === 0 ? "linear" : "ease-out",
  });
  animation.translateY(offset).opacity(1).step({ duration });
  return animation.export() as BottomActionAnimation;
}

/**
 * Runs the fixed footer through a real, native mini-program animation. The
 * footer is mounted and translated below the viewport before its entry begins;
 * the measurement is used only to tighten that hidden offset after the first
 * committed paint.
 */
export function useBottomActionReveal(
  enabled: boolean,
  replayKey = 0,
  resultRevealPhase: MealRecognitionMotionPhase = "idle",
) {
  const phaseRef = useRef(resultRevealPhase);
  const [phase, setPhase] = useState<BottomActionRevealPhase>(enabled ? "hidden" : "entered");
  const [animation, setAnimation] = useState<BottomActionAnimation>(() =>
    createBottomActionAnimation(enabled ? getViewportOffset() : 0, 0),
  );

  useEffect(() => {
    phaseRef.current = resultRevealPhase;
  }, [resultRevealPhase]);

  useEffect(() => {
    if (!enabled) {
      setPhase("entered");
      setAnimation(createBottomActionAnimation(0, 0));
      return;
    }

    let cancelled = false;
    let revealTimeout: ReturnType<typeof setTimeout> | undefined;
    let paintTimeout: ReturnType<typeof setTimeout> | undefined;
    let enterEndTimeout: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    const initialViewportOffset = getViewportOffset();

    logBottomReveal("mounted", phaseRef.current);
    setPhase("hidden");
    setAnimation(createBottomActionAnimation(initialViewportOffset, 0));
    logBottomReveal("initial hidden applied", phaseRef.current);

    Taro.nextTick(() => {
      if (cancelled) return;
      Taro.createSelectorQuery()
        .select(`#${BOTTOM_ACTION_ID}`)
        .boundingClientRect((rect) => {
          if (cancelled) return;
          const boundingRect = Array.isArray(rect) ? rect[0] : rect;
          const measuredHeight = typeof boundingRect?.height === "number" ? boundingRect.height : 0;
          const measuredOffset = measuredHeight > 0
            ? measuredHeight + BOTTOM_ACTION_SAFE_OFFSET_PX
            : initialViewportOffset;

          logBottomReveal(`measured height = ${measuredHeight}`, phaseRef.current);
          setAnimation(createBottomActionAnimation(measuredOffset, 0));
          logBottomReveal("initial hidden applied", phaseRef.current);

          Taro.nextTick(() => {
            paintTimeout = setTimeout(() => {
              if (cancelled) return;
              logBottomReveal("initial paint complete", phaseRef.current);
              const elapsed = Date.now() - startedAt;
              const delay = Math.max(0, mealRecognitionMotionConfig.bottomActionNativeRevealAtMs - elapsed);

              revealTimeout = setTimeout(() => {
                if (cancelled) return;
                logBottomReveal("enter start", phaseRef.current);
                setAnimation(createBottomActionAnimation(0, mealRecognitionMotionConfig.bottomActionDurationMs));
                setPhase("entered");
                enterEndTimeout = setTimeout(() => {
                  if (!cancelled) logBottomReveal("enter end", phaseRef.current);
                }, mealRecognitionMotionConfig.bottomActionDurationMs);
              }, delay);
            }, PAINT_WAIT_MS);
          });
        })
        .exec();
    });

    return () => {
      cancelled = true;
      if (revealTimeout) clearTimeout(revealTimeout);
      if (paintTimeout) clearTimeout(paintTimeout);
      if (enterEndTimeout) clearTimeout(enterEndTimeout);
    };
  }, [enabled, replayKey]);

  return { animation, phase };
}
