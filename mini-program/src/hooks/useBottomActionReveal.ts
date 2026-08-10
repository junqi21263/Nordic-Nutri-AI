import Taro from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import { mealRecognitionMotionConfig, type MealRecognitionMotionPhase } from "../features/scanner/meal-recognition-motion";

export type BottomActionRevealPhase = "hidden" | "shell" | "disclaimer" | "adjust" | "save" | "complete";

const BOTTOM_ACTION_ID = "meal-bottom-action";
const BOTTOM_ACTION_SAFE_OFFSET_PX = 20;
const PAINT_WAIT_MS = 24;

type BottomActionAnimation = Record<string, unknown>;

type BottomActionAnimations = {
  shell: BottomActionAnimation;
  disclaimer: BottomActionAnimation;
  adjustButton: BottomActionAnimation;
  saveButton: BottomActionAnimation;
};

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

function createAnimation(
  { opacity, translateY, scale = 1 }: { opacity: number; translateY: number; scale?: number },
  duration: number,
) {
  const animation = Taro.createAnimation({
    duration,
    timingFunction: duration === 0 ? "linear" : "ease-out",
  });
  animation.opacity(opacity).translateY(translateY).scale(scale).step({ duration });
  return animation.export() as BottomActionAnimation;
}

function createInitialAnimations(shellOffset: number, enabled: boolean): BottomActionAnimations {
  if (!enabled) {
    const visible = createAnimation({ opacity: 1, translateY: 0 }, 0);
    return { shell: visible, disclaimer: visible, adjustButton: visible, saveButton: visible };
  }
  return {
    shell: createAnimation({ opacity: 1, translateY: shellOffset }, 0),
    disclaimer: createAnimation({ opacity: 0, translateY: 8 }, 0),
    adjustButton: createAnimation({ opacity: 0, translateY: 10, scale: 0.97 }, 0),
    saveButton: createAnimation({ opacity: 0, translateY: 12, scale: 0.96 }, 0),
  };
}

/**
 * Plays the fixed result action bar as four native mini-program phases. Each
 * child stays mounted but receives its own duration-zero hidden export before
 * the shell begins entering the viewport.
 */
export function useBottomActionReveal(
  enabled: boolean,
  replayKey = 0,
  resultRevealPhase: MealRecognitionMotionPhase = "idle",
) {
  const phaseRef = useRef(resultRevealPhase);
  const [phase, setPhase] = useState<BottomActionRevealPhase>(enabled ? "hidden" : "complete");
  const [animations, setAnimations] = useState<BottomActionAnimations>(() =>
    createInitialAnimations(enabled ? getViewportOffset() : 0, enabled),
  );

  useEffect(() => {
    phaseRef.current = resultRevealPhase;
  }, [resultRevealPhase]);

  useEffect(() => {
    if (!enabled) {
      setPhase("complete");
      setAnimations(createInitialAnimations(0, false));
      return;
    }

    let cancelled = false;
    const timeouts: Array<ReturnType<typeof setTimeout>> = [];
    const startedAt = Date.now();
    const initialViewportOffset = getViewportOffset();

    const schedule = (delayMs: number, callback: () => void) => {
      const timeout = setTimeout(() => {
        if (!cancelled) callback();
      }, delayMs);
      timeouts.push(timeout);
    };

    const playBottomActionSequence = () => {
      logBottomReveal("enter start", phaseRef.current);
      setPhase("shell");
      setAnimations((current) => ({
        ...current,
        shell: createAnimation({ opacity: 1, translateY: 0 }, mealRecognitionMotionConfig.bottomActionShellDurationMs),
      }));

      const disclaimerStartMs =
        mealRecognitionMotionConfig.bottomActionShellDurationMs +
        mealRecognitionMotionConfig.bottomActionShellPauseMs;

      schedule(disclaimerStartMs, () => {
        setPhase("disclaimer");
        setAnimations((current) => ({
          ...current,
          disclaimer: createAnimation({ opacity: 1, translateY: 0 }, mealRecognitionMotionConfig.bottomActionDisclaimerDurationMs),
        }));
      });
      schedule(mealRecognitionMotionConfig.bottomActionAdjustStartMs, () => {
        setPhase("adjust");
        setAnimations((current) => ({
          ...current,
          adjustButton: createAnimation({ opacity: 1, translateY: 0, scale: 1 }, mealRecognitionMotionConfig.bottomActionAdjustDurationMs),
        }));
      });
      schedule(mealRecognitionMotionConfig.bottomActionSaveStartMs, () => {
        setPhase("save");
        setAnimations((current) => ({
          ...current,
          saveButton: createAnimation({ opacity: 1, translateY: 0, scale: 1 }, mealRecognitionMotionConfig.bottomActionSaveDurationMs),
        }));
      });
      schedule(mealRecognitionMotionConfig.bottomActionSequenceDurationMs, () => {
        setPhase("complete");
        logBottomReveal("enter end", phaseRef.current);
      });
    };

    logBottomReveal("mounted", phaseRef.current);
    setPhase("hidden");
    setAnimations(createInitialAnimations(initialViewportOffset, true));
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
          setAnimations(createInitialAnimations(measuredOffset, true));
          logBottomReveal("initial hidden applied", phaseRef.current);

          Taro.nextTick(() => {
            schedule(PAINT_WAIT_MS, () => {
              logBottomReveal("initial paint complete", phaseRef.current);
              const elapsed = Date.now() - startedAt;
              schedule(Math.max(0, mealRecognitionMotionConfig.bottomActionNativeRevealAtMs - elapsed), playBottomActionSequence);
            });
          });
        })
        .exec();
    });

    return () => {
      cancelled = true;
      timeouts.forEach((timeout) => clearTimeout(timeout));
    };
  }, [enabled, replayKey]);

  return {
    adjustButtonAnimation: animations.adjustButton,
    animation: animations.shell,
    disclaimerAnimation: animations.disclaimer,
    isAdjustInteractive: phase === "adjust" || phase === "save" || phase === "complete",
    isSaveInteractive: phase === "save" || phase === "complete",
    phase,
    saveButtonAnimation: animations.saveButton,
  };
}
