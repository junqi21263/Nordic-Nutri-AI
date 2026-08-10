import { useEffect, useState } from "react";
import {
  getMealRecognitionMotionPhaseSchedule,
  type MealRecognitionMotionPhase,
} from "../features/scanner/meal-recognition-motion";

export type { MealRecognitionMotionPhase } from "../features/scanner/meal-recognition-motion";

export function useMealRecognitionMotion(enabled: boolean, replayKey = 0) {
  const [phase, setPhase] = useState<MealRecognitionMotionPhase>(enabled ? "idle" : "complete");

  useEffect(() => {
    if (!enabled) {
      setPhase("complete");
      return;
    }

    setPhase("idle");
    const timeouts = getMealRecognitionMotionPhaseSchedule().map(({ atMs, phase: nextPhase }) =>
      setTimeout(() => setPhase(nextPhase), atMs),
    );
    return () => timeouts.forEach((timeout) => clearTimeout(timeout));
  }, [enabled, replayKey]);

  return {
    phase,
    isRevealing: enabled && phase !== "complete",
  };
}
