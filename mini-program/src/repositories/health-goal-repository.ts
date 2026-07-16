export type AppGoalType = "muscle_gain" | "fat_loss" | "maintenance" | "performance";
export type DatabaseGoalType = "muscle_gain" | "fat_loss" | "maintain" | "performance";

export interface HealthGoalInput {
  goalType: AppGoalType;
  targetWeightKg: number | null;
  targetDate: string | null;
}

export function toDatabaseGoalType(goalType: AppGoalType): DatabaseGoalType {
  return goalType === "maintenance" ? "maintain" : goalType;
}

export function validateGoalInput(input: HealthGoalInput, today: string): void {
  if (input.targetWeightKg !== null && (input.targetWeightKg < 30 || input.targetWeightKg > 300)) {
    throw new Error("目标体重需在 30–300 kg 之间");
  }
  if (input.targetDate && input.targetDate <= today) throw new Error("目标日期必须晚于今天");
}
