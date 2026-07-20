type Row = Record<string, unknown>;

export interface BodyProfileInput {
  age?: number;
  birthDate: string | null;
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
      const age = input.birthDate ? ageOnDate(input.birthDate, today) : input.age;
      if (typeof age !== "number" || !Number.isInteger(age) || age < 14 || age > 80) throw new Error("年龄需在 14–80 岁之间");
      const payload: Row = {
        user_id: userId,
        age,
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
