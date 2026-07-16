declare namespace NodeJS {
  interface ProcessEnv {
    TARO_APP_ENV?: "local" | "development" | "production";
    TARO_APP_SUPABASE_URL?: string;
    TARO_APP_SUPABASE_PUBLISHABLE_KEY?: string;
    TARO_APP_ENABLE_REAL_AUTH?: "true" | "false";
    TARO_APP_USE_REAL_BACKEND?: "true" | "false";
  }
}
