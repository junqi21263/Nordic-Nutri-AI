import type { Meal, MealItem, MealType } from "../features/meals/domain";

type Row = Record<string, unknown>;

export interface MealMutationItem {
  name: string;
  foodId?: string | null;
  aiQuantityG?: number | null;
  confirmedQuantityG: number;
  caloriesPer100G: number;
  proteinGPer100G: number;
  carbsGPer100G: number;
  fatGPer100G: number;
}

export interface MealMutationInput {
  title: string;
  mealType: MealType;
  recordedAt: string;
  isFavorite: boolean;
  items: MealMutationItem[];
}

export interface MealCreateInput extends MealMutationInput {
  clientRequestId: string;
}

export interface MealRepositoryClient {
  rpc: (name: "save_meal_atomic" | "update_meal_atomic", args: { p_input: Row }) => Promise<{ data: unknown; error: unknown }>;
}

function number(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function dateAndTime(recordedAt: unknown) {
  const date = new Date(String(recordedAt));
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  return {
    date: `${safe.getFullYear()}-${String(safe.getMonth() + 1).padStart(2, "0")}-${String(safe.getDate()).padStart(2, "0")}`,
    time: `${String(safe.getHours()).padStart(2, "0")}:${String(safe.getMinutes()).padStart(2, "0")}`,
  };
}

function mapItem(row: Row): MealItem {
  const quantity = number(row.confirmed_quantity_g);
  const per100 = (key: string) => number(row[key]);
  return {
    id: String(row.id ?? row.name),
    name: String(row.name ?? "未命名食材"),
    amount: `${quantity}g`,
    calories: Math.round(quantity * per100("calories_per_100g") / 100),
    protein: Math.round(quantity * per100("protein_g_per_100g") / 100 * 10) / 10,
    carbs: Math.round(quantity * per100("carbs_g_per_100g") / 100 * 10) / 10,
    fat: Math.round(quantity * per100("fat_g_per_100g") / 100 * 10) / 10,
  };
}

function mapResult(result: unknown): Meal {
  const payload = result as { meal?: Row; items?: Row[] };
  const meal = payload.meal;
  if (!meal || !Array.isArray(payload.items)) throw new Error("餐次保存响应无效");
  return {
    id: String(meal.id),
    ...dateAndTime(meal.recorded_at),
    title: String(meal.name),
    mealType: meal.meal_type as MealType,
    favorite: Boolean(meal.is_favorite),
    imageKey: null,
    insight: "",
    items: payload.items.map(mapItem),
  };
}

function toPayload(input: MealMutationInput): Row {
  return {
    name: input.title,
    mealType: input.mealType,
    recordedAt: input.recordedAt,
    isFavorite: input.isFavorite,
    items: input.items.map((item) => ({
      name: item.name,
      foodId: item.foodId ?? "",
      aiQuantityG: item.aiQuantityG ?? "",
      confirmedQuantityG: item.confirmedQuantityG,
      caloriesPer100g: item.caloriesPer100G,
      proteinGPer100g: item.proteinGPer100G,
      carbsGPer100g: item.carbsGPer100G,
      fatGPer100g: item.fatGPer100G,
    })),
  };
}

async function invoke(client: MealRepositoryClient, name: "save_meal_atomic" | "update_meal_atomic", payload: Row) {
  const { data, error } = await client.rpc(name, { p_input: payload });
  if (error || !data) throw new Error("餐次保存失败，请稍后重试");
  return mapResult(data);
}

export function createMealRepository(client: MealRepositoryClient) {
  return {
    create(input: MealCreateInput) {
      return invoke(client, "save_meal_atomic", { ...toPayload(input), clientRequestId: input.clientRequestId });
    },
    update(mealId: string, input: MealMutationInput) {
      return invoke(client, "update_meal_atomic", { ...toPayload(input), mealId });
    },
  };
}
