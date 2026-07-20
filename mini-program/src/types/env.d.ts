declare namespace NodeJS {
  interface ProcessEnv {
    TARO_APP_ENV?: "local" | "development" | "production";
  }
}
