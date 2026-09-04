declare namespace NodeJS {
  interface ProcessEnv {
    TARO_APP_ENV?: "local" | "development" | "production";
    TARO_APP_PLATFORM?: "wechat" | "android";
    TARO_APP_API_BASE_URL?: string;
    /** Optional HTTPS CDN base; blank keeps packaged JPGs as the only source. */
    TARO_APP_MILESTONE_ASSET_CDN?: string;
    TARO_APP_API_BASE_URL?: string;
  }
}
