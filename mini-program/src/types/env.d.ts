declare namespace NodeJS {
  interface ProcessEnv {
    TARO_APP_ENV?: "local" | "development" | "production";
    TARO_APP_SUPABASE_URL?: string;
    TARO_APP_SUPABASE_PUBLISHABLE_KEY?: string;
  }
}
