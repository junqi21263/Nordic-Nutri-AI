type Row = Record<string, unknown>;

export interface BodyProfileInput {
  birthDate: string;
  sex: "female" | "male" | "undisclosed";
  heightCm: number;
  weightKg: number;
  activityLevel: "sedentary" | "light" | "moderate" | "high" | "very_high";
  trainingDays: number;
}

export interface BodyProfileRepositoryClient {
  from: (table: "body_profiles") => {
    insert: (payload: Row) => { select: () => { single: () => Promise<{ data: Row | null; error: unknown }> } };
  };
}

export function ageOnDate(birthDate: string, today: string): number {
  const [birthYear, birthMonth, birthDay] = birthDate.split("-").map(Number);
  const [year, month, day] = today.split("-").map(Number);
  return year - birthYear - (month < birthMonth || (month === birthMonth && day < birthDay) ? 1 : 0);
}

export function createBodyProfileRepository(client: BodyProfileRepositoryClient) {
  return {
    async saveVersion(userId: string, input: BodyProfileInput, today: string) {
      const payload: Row = {
        user_id: userId,
        age: ageOnDate(input.birthDate, today),
        birth_date: input.birthDate,
        sex: input.sex,
        height_cm: input.heightCm,
        weight_kg: input.weightKg,
        activity_level: input.activityLevel,
        training_days_per_week: input.trainingDays,
        is_current: true,
      };
      const { data, error } = await client.from("body_profiles").insert(payload).select().single();
      if (error || !data) throw new Error("身体资料保存失败，请稍后重试");
      return data;
    },
  };
}
