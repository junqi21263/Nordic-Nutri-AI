import type { RepositoryError } from "./types";

type Row = Record<string, unknown>;

type UpdateQuery = {
  eq: (column: string, value: string) => {
    select: () => {
      single: () => Promise<{ data: Row | null; error: unknown }>;
    };
  };
};

export interface ProfileRepositoryClient {
  from: (table: "profiles" | "user_settings") => {
    update: (payload: Row) => UpdateQuery;
  };
}

export interface ProfileUpdate {
  nickname?: string | null;
  avatarPath?: string | null;
  timezone?: string;
}

export interface SettingsUpdate {
  dietaryPattern?: string;
  foodAvoidances?: string[];
  mealsPerDay?: number;
  theme?: "light" | "dark" | "system";
  locale?: "zh-CN" | "en";
  unitSystem?: "metric" | "imperial";
  notificationEnabled?: boolean;
}

function repositoryError(message: string, code: RepositoryError["code"]): RepositoryError {
  return { code, message, retryable: code === "NETWORK" || code === "UNKNOWN" };
}

function toProfilePayload(input: ProfileUpdate): Row {
  const payload: Row = {};
  if (input.nickname !== undefined) payload.nickname = input.nickname;
  if (input.avatarPath !== undefined) payload.avatar_path = input.avatarPath;
  if (input.timezone !== undefined) payload.timezone = input.timezone;
  return payload;
}

function toSettingsPayload(input: SettingsUpdate): Row {
  if (input.mealsPerDay !== undefined && (input.mealsPerDay < 2 || input.mealsPerDay > 5)) {
    throw repositoryError("每日餐数需在 2–5 餐之间", "VALIDATION");
  }
  const payload: Row = {};
  if (input.dietaryPattern !== undefined) payload.dietary_pattern = input.dietaryPattern;
  if (input.foodAvoidances !== undefined) payload.food_avoidances = input.foodAvoidances;
  if (input.mealsPerDay !== undefined) payload.meals_per_day = input.mealsPerDay;
  if (input.theme !== undefined) payload.theme = input.theme;
  if (input.locale !== undefined) payload.locale = input.locale;
  if (input.unitSystem !== undefined) payload.unit_system = input.unitSystem;
  if (input.notificationEnabled !== undefined) payload.notification_enabled = input.notificationEnabled;
  return payload;
}

async function updateRow(client: ProfileRepositoryClient, table: "profiles" | "user_settings", userId: string, payload: Row) {
  const { data, error } = await client.from(table).update(payload).eq("id", userId).select().single();
  if (error || !data) throw repositoryError("保存失败，请稍后重试", "UNKNOWN");
  return data;
}

export function createProfileRepository(client: ProfileRepositoryClient) {
  return {
    async updateProfile(userId: string, input: ProfileUpdate) {
      return updateRow(client, "profiles", userId, toProfilePayload(input));
    },
    async updateSettings(userId: string, input: SettingsUpdate) {
      return updateRow(client, "user_settings", userId, toSettingsPayload(input));
    },
  };
}
