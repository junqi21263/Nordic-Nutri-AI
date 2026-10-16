const DEVELOPMENT_API_BASE_URL = "https://test-dev-d4gyxnn0b5dfa2c8a.service.tcloudbase.com";
const PRODUCTION_API_BASE_URL = "https://lewis-healthy-d4glgqqzv73a5bc10.service.tcloudbase.com";

export function resolveProductApiBaseUrl({ configuredApiBaseUrl, appEnvironment }: {
  configuredApiBaseUrl: string;
  appEnvironment: string;
}) {
  const configured = configuredApiBaseUrl.trim().replace(/\/$/, "");
  const endpoint = configured || (appEnvironment === "production" ? PRODUCTION_API_BASE_URL : DEVELOPMENT_API_BASE_URL);
  if (appEnvironment === "production" && new URL(endpoint).protocol !== "https:") {
    throw new Error("生产 API 必须使用 HTTPS。");
  }
  return endpoint;
}

const configuredApiBaseUrl = resolveProductApiBaseUrl({
  configuredApiBaseUrl: process.env.TARO_APP_API_BASE_URL ?? "",
  appEnvironment: process.env.TARO_APP_ENV ?? "development",
});

export const productApiEndpoint = `${configuredApiBaseUrl}/get-login-ticket`;
export const googleServerClientId = process.env.TARO_APP_GOOGLE_SERVER_CLIENT_ID ?? "";
