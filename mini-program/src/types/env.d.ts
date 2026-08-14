declare namespace NodeJS {
  interface ProcessEnv {
    TARO_APP_ENV?: "local" | "development" | "production";
    /** Optional HTTPS CDN base; blank keeps packaged JPGs as the only source. */
    TARO_APP_MILESTONE_ASSET_CDN?: string;
  }
}
