export type AppEnvironment = "local" | "development" | "production";

export interface PublicRuntimeConfig {
  environment: AppEnvironment;
  supabaseUrl: string;
  supabasePublishableKey: string;
  useRealBackend: boolean;
  enableRealAuth: boolean;
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
    useRealBackend: process.env.TARO_APP_USE_REAL_BACKEND === "true",
    enableRealAuth: process.env.TARO_APP_ENABLE_REAL_AUTH === "true",
  };
}
