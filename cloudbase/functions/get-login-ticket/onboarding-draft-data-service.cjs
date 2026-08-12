const goalTypes = new Set(["muscle_gain", "fat_loss", "maintenance", "performance"]);
const genders = new Set(["male", "female"]);
const activityLevels = new Set(["sedentary", "light", "moderate", "high", "very_high"]);
const dietaryPatterns = new Set(["none", "vegetarian", "vegan", "pescatarian", "low_carb", "keto", "mediterranean", "halal"]);
const foodAvoidances = new Set(["dairy", "nuts", "seafood", "beef", "eggs", "gluten", "pork", "soy", "spicy"]);
const mealCounts = new Set(["2", "3", "4", "5"]);
const draftKeys = new Set([
  "nickname", "goalType", "age", "gender", "heightCm", "weightKg", "activityLevel",
  "trainingDays", "targetWeightKg", "targetDate", "dietaryPattern", "foodAvoidances", "mealsPerDay",
]);

class PublicOnboardingDraftError extends Error {
  constructor(message = "初次录入草稿无效") {
    super(message);
    this.code = "ONBOARDING_DRAFT_INVALID";
  }
}

function stringOrNull(value, accepted, maxLength = 40) {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > maxLength || (accepted && !accepted.has(value))) {
    throw new PublicOnboardingDraftError();
  }
  return value;
}

function normalizeDraft(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new PublicOnboardingDraftError();
  if (Object.keys(input).some((key) => !draftKeys.has(key))) throw new PublicOnboardingDraftError();
  const list = input.foodAvoidances;
  if (!Array.isArray(list) || list.length > foodAvoidances.size || list.some((item) => typeof item !== "string" || !foodAvoidances.has(item))) {
    throw new PublicOnboardingDraftError();
  }
  return {
    nickname: stringOrNull(input.nickname, null) ?? "",
    goalType: stringOrNull(input.goalType, goalTypes),
    age: stringOrNull(input.age, null, 3) ?? "",
    gender: stringOrNull(input.gender, genders),
    heightCm: stringOrNull(input.heightCm, null, 6) ?? "",
    weightKg: stringOrNull(input.weightKg, null, 6) ?? "",
    activityLevel: stringOrNull(input.activityLevel, activityLevels),
    trainingDays: stringOrNull(input.trainingDays, null, 2) ?? "",
    targetWeightKg: stringOrNull(input.targetWeightKg, null, 6) ?? "",
    targetDate: stringOrNull(input.targetDate, null, 10) ?? "",
    dietaryPattern: stringOrNull(input.dietaryPattern, dietaryPatterns),
    foodAvoidances: [...new Set(list)],
    mealsPerDay: stringOrNull(input.mealsPerDay, mealCounts),
  };
}

function createOnboardingDraftDataService({ db }) {
  if (!db || typeof db.from !== "function") throw new Error("Onboarding draft database is unavailable");
  return {
    async save(userId, input) {
      const payload = normalizeDraft(input);
      const result = await db.from("onboarding_drafts")
        .upsert({ user_id: userId, payload, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
        .select("payload")
        .single();
      if (result.error || !result.data?.payload) throw new Error("Onboarding draft save failed");
      return result.data.payload;
    },
    async get(userId) {
      const result = await db.from("onboarding_drafts").select("payload").eq("user_id", userId).maybeSingle();
      if (result.error) throw new Error("Onboarding draft read failed");
      return result.data?.payload ? normalizeDraft(result.data.payload) : null;
    },
    async clear(userId) {
      const result = await db.from("onboarding_drafts").delete().eq("user_id", userId);
      if (result.error) throw new Error("Onboarding draft clear failed");
    },
  };
}

module.exports = { createOnboardingDraftDataService, PublicOnboardingDraftError };
