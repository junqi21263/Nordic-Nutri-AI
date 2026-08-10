import { useEffect, useState } from "react";
import { mealRecognitionMotionConfig } from "../features/scanner/meal-recognition-motion";

export type MealRecognitionMotionPhase =
  | "idle"
  | "imageReady"
  | "status"
  | "foodReveal"
  | "nutritionReveal"
  | "nutritionCounting"
  | "actionReveal"
  | "complete";

const phaseSchedule: Array<{ atMs: number; phase: MealRecognitionMotionPhase }> = [
  { atMs: 0, phase: "imageReady" },
  { atMs: mealRecognitionMotionConfig.statusAtMs, phase: "status" },
  { atMs: mealRecognitionMotionConfig.foodAtMs, phase: "foodReveal" },
  { atMs: mealRecognitionMotionConfig.nutritionAtMs, phase: "nutritionReveal" },
  { atMs: mealRecognitionMotionConfig.countAtMs, phase: "nutritionCounting" },
  { atMs: mealRecognitionMotionConfig.actionAtMs, phase: "actionReveal" },
  { atMs: mealRecognitionMotionConfig.completeAtMs, phase: "complete" },
];

export function useMealRecognitionMotion(enabled: boolean, replayKey = 0) {
  const [phase, setPhase] = useState<MealRecognitionMotionPhase>(enabled ? "idle" : "complete");

  useEffect(() => {
    if (!enabled) {
      setPhase("complete");
      return;
    }

    setPhase("idle");
    const timeouts = phaseSchedule.map(({ atMs, phase: nextPhase }) =>
      setTimeout(() => setPhase(nextPhase), atMs),
    );
    return () => timeouts.forEach((timeout) => clearTimeout(timeout));
  }, [enabled, replayKey]);

  return {
    phase,
    isRevealing: enabled && phase !== "complete",
  };
}
