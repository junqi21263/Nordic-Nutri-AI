export type AppGoalType = "muscle_gain" | "fat_loss" | "maintenance" | "performance";
export type DatabaseGoalType = "muscle_gain" | "fat_loss" | "maintain" | "performance";

export interface HealthGoalInput {
  goalType: AppGoalType;
  targetWeightKg: number | null;
  targetDate: string | null;
}

type Row = Record<string, unknown>;

export interface HealthGoalRepositoryClient {
  from: (table: "user_goals") => {
    insert: (payload: Row) => { select: () => { single: () => Promise<{ data: Row | null; error: unknown }> } };
  };
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

export function createHealthGoalRepository(client: HealthGoalRepositoryClient) {
  return {
    async saveVersion(userId: string, input: HealthGoalInput, today: string) {
      validateGoalInput(input, today);
      const payload: Row = {
        user_id: userId,
        goal_type: toDatabaseGoalType(input.goalType),
        target_weight_kg: input.targetWeightKg,
        target_date: input.targetDate,
        is_current: true,
      };
      const { data, error } = await client.from("user_goals").insert(payload).select().single();
      if (error || !data) throw new Error("目标保存失败，请稍后重试");
      return data;
    },
  };
}
