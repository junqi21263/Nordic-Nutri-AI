export type AppEnvironment = "local" | "development" | "production";

export interface PublicRuntimeConfig {
  environment: AppEnvironment;
  supabaseUrl: string;
  supabasePublishableKey: string;
}

function getEnvironment(): AppEnvironment {
  const value = process.env.TARO_APP_ENV;
  return value === "development" || value === "production" ? value : "local";
}

export function getPublicRuntimeConfig(): PublicRuntimeConfig {
  return {
    environment: getEnvironment(),
    supabaseUrl: process.env.TARO_APP_SUPABASE_URL ?? "",
    supabasePublishableKey: process.env.TARO_APP_SUPABASE_PUBLISHABLE_KEY ?? "",
  };
}
