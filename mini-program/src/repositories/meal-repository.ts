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

export interface MealListInput {
  date: string;
  mealType?: MealType;
  keyword?: string;
  offset: number;
  limit: number;
}

export interface MealListResult {
  meals: Meal[];
  hasMore: boolean;
}

export function toMealMutationInput(meal: Meal, changes: Partial<Pick<Meal, "title" | "mealType" | "favorite" | "items">> = {}): MealMutationInput {
  const items = changes.items ?? meal.items;
  return {
    title: changes.title ?? meal.title,
    mealType: changes.mealType ?? meal.mealType,
    recordedAt: `${meal.date}T${meal.time}:00`,
    isFavorite: changes.favorite ?? meal.favorite,
    items: items.map((item) => {
      const quantity = Number.parseFloat(item.amount) || 100;
      const per100 = (value: number) => Math.round((value * 10000) / quantity) / 100;
      return {
        name: item.name,
        confirmedQuantityG: quantity,
        caloriesPer100G: per100(item.calories),
        proteinGPer100G: per100(item.protein),
        carbsGPer100G: per100(item.carbs),
        fatGPer100G: per100(item.fat),
      };
    }),
  };
}

type QueryResult = { data: Row[] | Row | null; error: unknown };
type QueryChain = {
  gte?: (column: string, value: string) => QueryChain;
  lt?: (column: string, value: string) => QueryChain;
  eq?: (column: string, value: string) => QueryChain;
  ilike?: (column: string, value: string) => QueryChain;
  in?: (column: string, values: string[]) => Promise<QueryResult>;
  order?: (column: string, options?: { ascending?: boolean }) => QueryChain;
  range?: (from: number, to: number) => Promise<QueryResult>;
  select?: (columns?: string) => QueryChain;
  single?: () => Promise<QueryResult>;
};

export interface MealRepositoryClient {
  rpc: (name: "save_meal_atomic" | "update_meal_atomic", args: { p_input: Row }) => Promise<{ data: unknown; error: unknown }>;
  from?: (table: "active_meal_records" | "meal_records" | "meal_items") => {
    select?: (columns: string) => QueryChain;
    update?: (payload: Row) => QueryChain;
  };
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

function mapRows(mealRows: Row[], itemRows: Row[]): Meal[] {
  return mealRows.map((meal) =>
    mapResult({
      meal,
      items: itemRows.filter((item) => String(item.meal_record_id) === String(meal.id)),
    }),
  );
}

function dayAfter(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(year, month - 1, day);
  value.setDate(value.getDate() + 1);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function clientFrom(client: MealRepositoryClient, table: "active_meal_records" | "meal_records" | "meal_items") {
  if (!client.from) throw new Error("餐次读取能力不可用");
  return client.from(table);
}

async function loadItems(client: MealRepositoryClient, mealIds: string[]): Promise<Row[]> {
  if (mealIds.length === 0) return [];
  const select = clientFrom(client, "meal_items").select;
  if (!select) throw new Error("餐次读取能力不可用");
  const query = select("id,meal_record_id,name,confirmed_quantity_g,calories_per_100g,protein_g_per_100g,carbs_g_per_100g,fat_g_per_100g");
  if (!query.in) throw new Error("餐次读取能力不可用");
  const { data, error } = await query.in("meal_record_id", mealIds);
  if (error || !Array.isArray(data)) throw new Error("餐次读取失败，请稍后重试");
  return data;
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
    async list(input: MealListInput): Promise<MealListResult> {
      const select = clientFrom(client, "active_meal_records").select;
      if (!select) throw new Error("餐次读取能力不可用");
      let query = select("id,name,meal_type,recorded_at,is_favorite,calories_kcal,protein_g,carbs_g,fat_g");
      if (!query.gte) throw new Error("餐次读取能力不可用");
      query = query.gte("recorded_at", `${input.date}T00:00:00`);
      if (!query.lt) throw new Error("餐次读取能力不可用");
      query = query.lt!("recorded_at", `${dayAfter(input.date)}T00:00:00`);
      if (input.mealType) {
        if (!query.eq) throw new Error("餐次读取能力不可用");
        query = query.eq("meal_type", input.mealType);
      }
      if (input.keyword?.trim()) {
        if (!query.ilike) throw new Error("餐次读取能力不可用");
        query = query.ilike("name", `%${input.keyword.trim()}%`);
      }
      if (!query.order) throw new Error("餐次读取能力不可用");
      const ordered = query.order("recorded_at", { ascending: false });
      if (!ordered.range) throw new Error("餐次读取能力不可用");
      const { data, error } = await ordered.range(input.offset, input.offset + input.limit - 1);
      if (error || !Array.isArray(data)) throw new Error("餐次读取失败，请稍后重试");
      const items = await loadItems(client, data.map((row) => String(row.id)));
      return { meals: mapRows(data, items), hasMore: data.length === input.limit };
    },
    async archive(mealId: string): Promise<Meal> {
      return setArchivedAt(client, mealId, new Date().toISOString());
    },
    async restore(mealId: string): Promise<Meal> {
      return setArchivedAt(client, mealId, null);
    },
  };
}

async function setArchivedAt(client: MealRepositoryClient, mealId: string, deletedAt: string | null): Promise<Meal> {
  const update = clientFrom(client, "meal_records").update;
  if (!update) throw new Error("餐次保存能力不可用");
  const query = update({ deleted_at: deletedAt });
  if (!query.eq) throw new Error("餐次保存能力不可用");
  const selectQuery = query.eq("id", mealId);
  if (!selectQuery.select) throw new Error("餐次保存能力不可用");
  const singleQuery = selectQuery.select("id,name,meal_type,recorded_at,is_favorite,calories_kcal,protein_g,carbs_g,fat_g");
  if (!singleQuery.single) throw new Error("餐次保存能力不可用");
  const { data, error } = await singleQuery.single();
  if (error || !data || Array.isArray(data)) throw new Error("餐次保存失败，请稍后重试");
  const items = await loadItems(client, [mealId]);
  return mapRows([data], items)[0]!;
}
