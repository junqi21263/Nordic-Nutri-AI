export type AppEnvironment = "local" | "development" | "production";

export interface PublicRuntimeConfig {
  environment: AppEnvironment;
  enableRealAuth: boolean;
}

function getEnvironment(): AppEnvironment {
  const value = process.env.TARO_APP_ENV;
  return value === "development" || value === "production" ? value : "local";
}

export function getPublicRuntimeConfig(): PublicRuntimeConfig {
  return {
    environment: getEnvironment(),
    enableRealAuth: process.env.TARO_APP_ENABLE_REAL_AUTH === "true",
  };
}
